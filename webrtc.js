// Cliente WebRTC mejorado para transferencia de videos
let ws;
let localConnection;
let dataChannel;
let remoteId = '';
let clientId = '';
let currentFile = null;
let fileReader = null;
let receivedSize = 0;
let totalSize = 0;
let receivedChunks = [];
let receivingFileName = '';
let isConnected = false;

// Elementos DOM
const status = document.getElementById('status');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const downloadLink = document.getElementById('downloadLink');
const sendBtn = document.getElementById('sendBtn');
const fileInput = document.getElementById('fileInput');
const peersSelect = document.getElementById('peersSelect');

// Conectar al servidor WebSocket
function connectToServer() {
  // Obtener la URL del servidor desde la ubicación actual
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  
  ws = new WebSocket(wsUrl);
  
  ws.onopen = () => {
    status.textContent = 'Conectado al servidor';
    status.className = 'text-sm text-green-600';
    console.log('Conectado al servidor de señalización');
  };
  
  ws.onerror = (error) => {
    console.error('Error de WebSocket:', error);
    status.textContent = 'Error al conectar al servidor';
    status.className = 'text-sm text-red-600';
  };
  
  ws.onclose = () => {
    status.textContent = 'Desconectado del servidor';
    status.className = 'text-sm text-gray-600';
    isConnected = false;
    
    // Intentar reconectar después de un tiempo
    setTimeout(connectToServer, 3000);
  };
  
  ws.onmessage = handleServerMessage;
}

// Manejar mensajes del servidor
async function handleServerMessage(event) {
  let data;
  try {
    data = JSON.parse(event.data);
  } catch (e) {
    console.error('Error al parsear mensaje:', e);
    return;
  }
  
  console.log('Mensaje recibido:', data.type);
  
  switch (data.type) {
    case 'id':
      clientId = data.id;
      status.textContent = `Conectado como: ${clientId}`;
      console.log(`ID de cliente asignado: ${clientId}`);
      break;
      
    case 'peers-list':
      updatePeersList(data.peers);
      console.log('Lista de pares actualizada:', data.peers);
      break;
      
    case 'peer-connected':
      addPeerToList(data.id);
      console.log(`Nuevo par conectado: ${data.id}`);
      break;
      
    case 'peer-disconnected':
      removePeerFromList(data.id);
      console.log(`Par desconectado: ${data.id}`);
      
      // Si era el par con el que estábamos conectados, limpiar la conexión
      if (data.id === remoteId && isConnected) {
        cleanupConnection();
      }
      break;
      
    case 'offer':
      console.log(`Oferta recibida de: ${data.from}`);
      remoteId = data.from;
      await createAnswer(data.offer);
      break;
      
    case 'answer':
      console.log(`Respuesta recibida de: ${data.from}`);
      try {
        await localConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
        console.log('Descripción remota establecida correctamente');
      } catch (e) {
        console.error('Error al establecer descripción remota:', e);
      }
      break;
      
    case 'candidate':
      if (!localConnection) {
        console.warn('Se recibió un candidato ICE pero no hay conexión local');
        return;
      }
      
      try {
        console.log(`Candidato ICE recibido de: ${data.from}`);
        await localConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      } catch (e) {
        console.error('Error al agregar candidato ICE:', e);
      }
      break;
      
    case 'files-list':
      // Disparar evento para actualizar la lista de archivos en la interfaz
      const filesUpdatedEvent = new CustomEvent('filesUpdated', {
        detail: { files: data.files }
      });
      window.dispatchEvent(filesUpdatedEvent);
      console.log('Lista de archivos actualizada');
      break;
  }
}

// Actualizar lista de pares disponibles
function updatePeersList(peers) {
  peersSelect.innerHTML = '';
  
  if (peers.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No hay dispositivos disponibles';
    option.disabled = true;
    option.selected = true;
    peersSelect.appendChild(option);
    sendBtn.disabled = true;
  } else {
    // Agregar opción de selección por defecto
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Seleccionar dispositivo...';
    defaultOption.disabled = true;
    defaultOption.selected = true;
    peersSelect.appendChild(defaultOption);
    
    // Agregar pares disponibles
    peers.forEach(peerId => {
      addPeerToList(peerId);
    });
    
    // Habilitar botón de envío si hay pares y un archivo seleccionado
    updateSendButtonState();
  }
}

// Añadir un par a la lista
function addPeerToList(peerId) {
  // Comprobar si ya existe
  if (Array.from(peersSelect.options).some(option => option.value === peerId)) {
    return;
  }
  
  const option = document.createElement('option');
  option.value = peerId;
  option.textContent = `Dispositivo (${peerId})`;
  peersSelect.appendChild(option);
  
  // Actualizar estado del botón de envío
  updateSendButtonState();
}

// Eliminar un par de la lista
function removePeerFromList(peerId) {
  Array.from(peersSelect.options).forEach(option => {
    if (option.value === peerId) {
      peersSelect.removeChild(option);
    }
  });
  
  // Si no quedan opciones, agregar la opción por defecto
  if (peersSelect.options.length === 0) {
    const option = document.createElement('option');
    option.value = '';
    option.textContent = 'No hay dispositivos disponibles';
    option.disabled = true;
    option.selected = true;
    peersSelect.appendChild(option);
  }
  
  // Actualizar estado del botón de envío
  updateSendButtonState();
}

// Actualizar el estado del botón de envío
function updateSendButtonState() {
  const hasPeers = peersSelect.options.length > 0 && peersSelect.value !== '';
  const hasFile = fileInput.files && fileInput.files.length > 0;
  sendBtn.disabled = !hasPeers || !hasFile || isConnected;
}

// Limpiar la conexión actual
function cleanupConnection() {
  if (dataChannel) {
    dataChannel.close();
    dataChannel = null;
  }
  
  if (localConnection) {
    localConnection.close();
    localConnection = null;
  }
  
  isConnected = false;
  remoteId = '';
  
  // Restablecer la interfaz
  progressBar.classList.add('hidden');
  progressText.classList.add('hidden');
  status.textContent = 'Desconectado del par';
  status.className = 'text-sm text-gray-600';
  
  // Actualizar estado del botón de envío
  updateSendButtonState();
  
  console.log('Conexión limpiada');
}

// Configurar conexión WebRTC
function setupConnection(isSender) {
  try {
    // Limpiar cualquier conexión existente
    if (localConnection) {
      cleanupConnection();
    }
    
    console.log('Configurando nueva conexión WebRTC como', isSender ? 'emisor' : 'receptor');
    
    localConnection = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
      ]
    });
    
    // Configurar candidatos ICE
    localConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('Enviando candidato ICE a', remoteId);
        sendMessage({
          type: 'candidate',
          target: remoteId,
          candidate: event.candidate
        });
      } else {
        console.log('Todos los candidatos ICE han sido enviados');
      }
    };
    
    // Mostrar estado de la conexión
    localConnection.oniceconnectionstatechange = () => {
      console.log('Estado de la conexión ICE:', localConnection.iceConnectionState);
      
      if (localConnection.iceConnectionState === 'connected' || 
          localConnection.iceConnectionState === 'completed') {
        status.textContent = 'Conectado al par';
        status.className = 'text-sm text-green-600';
        isConnected = true;
        updateSendButtonState();
      } else if (localConnection.iceConnectionState === 'failed' || 
                localConnection.iceConnectionState === 'disconnected' ||
                localConnection.iceConnectionState === 'closed') {
        status.textContent = 'Desconectado del par';
        status.className = 'text-sm text-red-600';
        isConnected = false;
        updateSendButtonState();
      }
    };
    
    // Manejar errores de conexión
    localConnection.onerror = (error) => {
      console.error('Error en la conexión WebRTC:', error);
    };
    
    if (isSender) {
      // Crear canal de datos para enviar
      console.log('Creando canal de datos para enviar');
      dataChannel = localConnection.createDataChannel('fileTransfer', {
        ordered: true,
        maxRetransmits: 3
      });
      setupSenderDataChannel();
    } else {
      // Configurar para recibir datos
      console.log('Configurando para recibir datos');
      localConnection.ondatachannel = (event) => {
        console.log('Canal de datos recibido');
        dataChannel = event.channel;
        setupReceiverDataChannel();
      };
    }
    
    return true;
  } catch (error) {
    console.error('Error al configurar la conexión:', error);
    status.textContent = 'Error al crear la conexión';
    status.className = 'text-sm text-red-600';
    return false;
  }
}

// Configurar canal de datos para enviar
function setupSenderDataChannel() {
  dataChannel.binaryType = 'arraybuffer';
  
  // Cuando se abre el canal
  dataChannel.onopen = () => {
    console.log('Canal de datos abierto para enviar');
    status.textContent = 'Canal de datos abierto - Enviando archivo...';
    sendFile();
  };
  
  dataChannel.onclose = () => {
    console.log('Canal de datos cerrado');
    status.textContent = 'Canal de datos cerrado';
    isConnected = false;
    updateSendButtonState();
  };
  
  dataChannel.onerror = (error) => {
    console.error('Error en el canal de datos:', error);
    status.textContent = 'Error en el canal de datos';
    status.className = 'text-sm text-red-600';
  };
}

// Configurar canal de datos para recibir
function setupReceiverDataChannel() {
  dataChannel.binaryType = 'arraybuffer';
  receivedSize = 0;
  receivedChunks = [];
  
  // Cuando se abre el canal
  dataChannel.onopen = () => {
    console.log('Canal de datos abierto para recibir');
    status.textContent = 'Canal de datos abierto - Esperando archivo...';
    status.className = 'text-sm text-green-600';
    isConnected = true;
  };
  
  // Cuando se reciben datos
  dataChannel.onmessage = handleReceivedMessage;
  
  dataChannel.onclose = () => {
    console.log('Canal de datos cerrado');
    status.textContent = 'Canal de datos cerrado';
    status.className = 'text-sm text-gray-600';
    isConnected = false;
  };
  
  dataChannel.onerror = (error) => {
    console.error('Error en el canal de datos:', error);
    status.textContent = 'Error en el canal de datos';
    status.className = 'text-sm text-red-600';
  };
}

// Manejar mensaje recibido
function handleReceivedMessage(event) {
  // Si es un mensaje de metadatos
  if (typeof event.data === 'string') {
    const metadata = JSON.parse(event.data);
    
    if (metadata.type === 'file-metadata') {
      // Inicializar recepción de archivo
      console.log('Recibiendo metadatos del archivo:', metadata);
      totalSize = metadata.size;
      receivingFileName = metadata.name;
      receivedSize = 0;
      receivedChunks = [];
      
      // Mostrar barra de progreso
      progressBar.parentElement.querySelector('.progress-bar').style.width = '0%';
      progressText.textContent = `0% (0/${formatFileSize(totalSize)})`;
      progressBar.classList.remove('hidden');
      progressText.classList.remove('hidden');
      
      status.textContent = `Recibiendo ${receivingFileName}...`;
    } else if (metadata.type === 'file-complete') {
      // Finalizar recepción de archivo
      console.log('Archivo recibido completamente');
      const blob = new Blob(receivedChunks);
      const url = URL.createObjectURL(blob);
      
      downloadLink.innerHTML = `
        <div class="mt-4 bg-green-100 p-3 rounded">
          <p class="text-green-800 font-medium">¡Archivo recibido!</p>
          <p>${receivingFileName} (${formatFileSize(totalSize)})</p>
          <a href="${url}" download="${receivingFileName}" 
             class="mt-2 inline-block bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700">
            Descargar archivo
          </a>
        </div>
      `;
      
      progressBar.classList.add('hidden');
      progressText.classList.add('hidden');
      status.textContent = 'Archivo recibido completamente';
      status.className = 'text-sm text-green-600';
      
      // Limpiar arrays grandes para liberar memoria
      receivedChunks = [];
    }
  } else {
    // Añadir fragmento de datos
    receivedChunks.push(event.data);
    receivedSize += event.data.byteLength;
    
    // Actualizar progreso
    const percentage = Math.floor((receivedSize / totalSize) * 100);
    progressBar.parentElement.querySelector('.progress-bar').style.width = `${percentage}%`;
    progressText.textContent = `${percentage}% (${formatFileSize(receivedSize)}/${formatFileSize(totalSize)})`;
  }
}

// Enviar un archivo
function sendFile() {
  if (!dataChannel || dataChannel.readyState !== 'open') {
    alert('No hay conexión abierta con el par');
    return;
  }
  
  const file = currentFile;
  if (!file) {
    alert('Selecciona un archivo primero');
    return;
  }
  
  console.log(`Enviando archivo: ${file.name} (${formatFileSize(file.size)})`);
  
  // Enviar metadatos del archivo
  const metadata = {
    type: 'file-metadata',
    name: file.name,
    size: file.size,
    fileType: file.type
  };
  dataChannel.send(JSON.stringify(metadata));
  
  // Preparar para enviar archivo
  progressBar.parentElement.querySelector('.progress-bar').style.width = '0%';
  progressText.textContent = `0% (0/${formatFileSize(file.size)})`;
  progressBar.classList.remove('hidden');
  progressText.classList.remove('hidden');
  
  // Leer y enviar el archivo en fragmentos
  let offset = 0;
  const chunkSize = 64 * 1024; // 64 KB
  
  fileReader = new FileReader();
  
  fileReader.onload = (event) => {
    if (dataChannel.readyState === 'open') {
      dataChannel.send(event.target.result);
      offset += event.target.result.byteLength;
      
      // Actualizar progreso
      const percentage = Math.floor((offset / file.size) * 100);
      progressBar.parentElement.querySelector('.progress-bar').style.width = `${percentage}%`;
      progressText.textContent = `${percentage}% (${formatFileSize(offset)}/${formatFileSize(file.size)})`;
      
      // Si hay más datos para enviar
      if (offset < file.size) {
        readSlice(offset);
      } else {
        // Enviar mensaje de finalización
        dataChannel.send(JSON.stringify({ type: 'file-complete' }));
        status.textContent = 'Archivo enviado completamente';
        status.className = 'text-sm text-green-600';
        
        setTimeout(() => {
          progressBar.classList.add('hidden');
          progressText.classList.add('hidden');
        }, 2000);
      }
    }
  };
  
  fileReader.onerror = (error) => {
    console.error('Error al leer el archivo:', error);
    status.textContent = 'Error al leer el archivo';
    status.className = 'text-sm text-red-600';
  };
  
  // Función para leer el archivo en trozos
  function readSlice(offset) {
    const slice = file.slice(offset, offset + chunkSize);
    fileReader.readAsArrayBuffer(slice);
  }
  
  // Comenzar a leer
  readSlice(0);
}

// Iniciar envío de archivo
function startSending() {
  const file = fileInput.files[0];
  if (!file) {
    alert('Por favor selecciona un archivo primero');
    return;
  }
  
  // Verificar si el archivo es un video
  const videoTypes = ['video/mp4', 'video/webm', 'video/mkv', 'video/avi', 'video/mov', 'video/flv', 'video/3gpp'];
  if (!videoTypes.includes(file.type) && !file.name.match(/\.(mp4|webm|mkv|avi|mov|flv|3gp)$/i)) {
    if (!confirm('El archivo seleccionado no parece ser un video. ¿Deseas continuar de todos modos?')) {
      return;
    }
  }
  
  const selectedPeerId = peersSelect.value;
  if (!selectedPeerId) {
    alert('No hay dispositivos disponibles para enviar');
    return;
  }
  
  currentFile = file;
  remoteId = selectedPeerId;
  
  console.log(`Iniciando envío a ${remoteId}`);
  
  // Configurar conexión WebRTC
  if (setupConnection(true)) {
    // Crear oferta
    localConnection.createOffer().then(offer => {
      console.log('Oferta creada, estableciendo descripción local');
      return localConnection.setLocalDescription(offer);
    }).then(() => {
      console.log('Enviando oferta a', remoteId);
      sendMessage({
        type: 'offer',
        offer: localConnection.localDescription,
        target: remoteId
      });
      
      status.textContent = 'Enviando oferta al dispositivo...';
    }).catch(error => {
      console.error('Error al crear oferta:', error);
      status.textContent = 'Error al crear oferta';
      status.className = 'text-sm text-red-600';
    });
  }
}

// Crear respuesta a una oferta
async function createAnswer(offer) {
  console.log('Creando respuesta a oferta recibida');
  
  if (setupConnection(false)) {
    try {
      console.log('Estableciendo descripción remota');
      await localConnection.setRemoteDescription(new RTCSessionDescription(offer));
      
      console.log('Creando respuesta');
      const answer = await localConnection.createAnswer();
      
      console.log('Estableciendo descripción local');
      await localConnection.setLocalDescription(answer);
      
      console.log('Enviando respuesta a', remoteId);
      sendMessage({
        type: 'answer',
        answer: localConnection.localDescription,
        target: remoteId
      });
      
      status.textContent = 'Enviando respuesta...';
    } catch (error) {
      console.error('Error al crear respuesta:', error);
      status.textContent = 'Error al crear respuesta';
      status.className = 'text-sm text-red-600';
    }
  }
}

// Enviar mensaje al servidor WebSocket
function sendMessage(message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    message.target = message.target || remoteId;
    ws.send(JSON.stringify(message));
    console.log(`Mensaje enviado a ${message.target}: ${message.type}`);
  } else {
    console.error('WebSocket no está conectado');
    status.textContent = 'No conectado al servidor';
    status.className = 'text-sm text-red-600';
  }
}

// Formatear tamaño de archivo
function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Eventos de interfaz de usuario
document.addEventListener('DOMContentLoaded', () => {
  console.log('Inicializando VLink WebRTC Client');
  
  // Conectar al servidor WebSocket
  connectToServer();
  
  // Configurar evento del botón de envío
  sendBtn.addEventListener('click', startSending);
  
  // Configurar evento del selector de archivos
  fileInput.addEventListener('change', () => {
    const file = fileInput.files[0];
    if (file) {
      document.getElementById('fileInfo').textContent = 
        `${file.name} (${formatFileSize(file.size)})`;
      updateSendButtonState();
    } else {
      document.getElementById('fileInfo').textContent = '';
      updateSendButtonState();
    }
  });
  
  // Configurar evento del selector de pares
  peersSelect.addEventListener('change', updateSendButtonState);
});