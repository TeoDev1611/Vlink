// Servidor de señalización WebSocket mejorado para la transferencia de videos
const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

// Obtener el puerto del servidor desde los argumentos
const PORT = process.argv[2] || 3000;

// Verificar si estamos en un entorno Neutralino
const isNeutralinoEnvironment = process.env.NL_PATH || process.argv.includes('--neutralino');

// Variables para almacenar información de archivos seleccionados
let selectedFiles = [];

// Intentar leer información de archivos desde almacenamiento local
// En un entorno Neutralino real, esto se haría de manera diferente
if (isNeutralinoEnvironment && fs.existsSync('./selectedFiles.json')) {
  try {
    const fileData = fs.readFileSync('./selectedFiles.json', 'utf8');
    selectedFiles = JSON.parse(fileData);
  } catch (e) {
    console.error('Error al leer información de archivos:', e);
  }
}

// Crear servidor HTTP
const server = http.createServer((req, res) => {
  const pathname = url.parse(req.url).pathname;
  
  // Configurar CORS para permitir acceso desde cualquier origen
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  // Manejar solicitudes de API
  if (pathname === '/api/files') {
    // Devolver lista de archivos disponibles
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(selectedFiles));
    return;
  } else if (pathname.startsWith('/api/file/')) {
    // Obtener el ID del archivo (el último segmento de la ruta)
    const fileId = pathname.split('/').pop();
    const fileIndex = parseInt(fileId, 10);
    
    if (isNaN(fileIndex) || fileIndex < 0 || fileIndex >= selectedFiles.length) {
      res.writeHead(404);
      res.end('Archivo no encontrado');
      return;
    }
    
    const file = selectedFiles[fileIndex];
    const filePath = file.path;
    
    // Verificar si el archivo existe
    if (!fs.existsSync(filePath)) {
      res.writeHead(404);
      res.end('Archivo no encontrado');
      return;
    }
    
    // Obtener estadísticas del archivo
    const stat = fs.statSync(filePath);
    
    // Leer el archivo y enviarlo como respuesta
    const fileStream = fs.createReadStream(filePath);
    res.writeHead(200, {
      'Content-Type': 'video/mp4',
      'Content-Length': stat.size,
      'Content-Disposition': `inline; filename="${file.name}"`
    });
    fileStream.pipe(res);
    return;
  }
  
  // Mapa de tipos MIME
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.ico': 'image/x-icon'
  };
  
  // Archivo a servir
  let filePath = '.' + pathname;
  if (pathname === '/') {
    filePath = './client.html';
  }
  
  // Determinar el tipo de contenido
  const extname = path.extname(filePath);
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // Leer y servir el archivo
  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        // Archivo no encontrado
        fs.readFile('./client.html', (err, content) => {
          if (err) {
            res.writeHead(500);
            res.end('Error interno del servidor');
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content, 'utf-8');
        });
      } else {
        // Error del servidor
        res.writeHead(500);
        res.end('Error interno del servidor: ' + error.code);
      }
    } else {
      // Servir contenido
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

// Crear servidor WebSocket
const wss = new WebSocket.Server({ server });

// Almacenar conexiones de clientes
let peers = {};

// Manejar conexiones WebSocket
wss.on('connection', socket => {
  // Asignar un ID único al cliente
  const id = Math.random().toString(36).substr(2, 9);
  peers[id] = socket;
  
  // Enviar el ID al cliente
  socket.send(JSON.stringify({ type: 'id', id }));
  
  // Manejar mensajes entrantes
  socket.on('message', message => {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Error al parsear mensaje:', e);
      return;
    }
    
    // Si es un mensaje especial para actualizar la lista de archivos
    if (data.type === 'update-files') {
      selectedFiles = data.files;
      // Guardar la información de archivos para futuras solicitudes
      if (isNeutralinoEnvironment) {
        fs.writeFileSync('./selectedFiles.json', JSON.stringify(selectedFiles));
      }
      return;
    }
    
    // Reenviar mensajes al destinatario
    const target = peers[data.target];
    if (target) {
      target.send(JSON.stringify({ ...data, from: id }));
      console.log(`Mensaje reenviado de ${id} a ${data.target}: ${data.type}`);
    } else {
      console.log(`Destino no encontrado: ${data.target}`);
    }
  });
  
  // Manejar desconexiones
  socket.on('close', () => {
    console.log(`Cliente desconectado: ${id}`);
    delete peers[id];
    
    // Notificar a otros clientes sobre la desconexión
    Object.keys(peers).forEach(peerId => {
      peers[peerId].send(JSON.stringify({
        type: 'peer-disconnected',
        id: id
      }));
    });
  });
  
  // Manejar errores
  socket.on('error', (error) => {
    console.error(`Error en cliente ${id}:`, error);
    delete peers[id];
  });
  
  // Enviar lista de clientes conectados
  const connectedPeers = Object.keys(peers).filter(peerId => peerId !== id);
  socket.send(JSON.stringify({
    type: 'peers-list',
    peers: connectedPeers
  }));
  
  // Notificar a otros clientes sobre la nueva conexión
  Object.keys(peers).forEach(peerId => {
    if (peerId !== id) {
      peers[peerId].send(JSON.stringify({
        type: 'peer-connected',
        id: id
      }));
    }
  });
  
  // Enviar lista de archivos disponibles
  socket.send(JSON.stringify({
    type: 'files-list',
    files: selectedFiles
  }));
  
  console.log(`Nuevo cliente conectado: ${id}`);
});

// Crear un método para actualizar la lista de archivos desde la aplicación Neutralino
function updateSelectedFiles(files) {
  selectedFiles = files;
  if (isNeutralinoEnvironment) {
    fs.writeFileSync('./selectedFiles.json', JSON.stringify(selectedFiles));
  }
  
  // Notificar a todos los clientes sobre la actualización
  Object.keys(peers).forEach(peerId => {
    peers[peerId].send(JSON.stringify({
      type: 'files-list',
      files: selectedFiles
    }));
  });
}

// Exponer el método de actualización
if (typeof global !== 'undefined') {
  global.updateSelectedFiles = updateSelectedFiles;
}

// Iniciar el servidor
server.listen(PORT, () => {
  console.log(`Servidor ejecutándose en: http://localhost:${PORT}`);
});