# 📺 VLink – Transferencia de videos entre dispositivos

**VLink** es una aplicación web simple y rápida para enviar y recibir videos entre tu computadora y dispositivos móviles 🚀. Ideal para compartir archivos sin complicaciones, usando solo un navegador y conexión local (¡o remota con Ngrok!).

---

## ✨ Características

- 🔁 **Envío y recepción** de videos entre dispositivos  
- 🎥 **Reproducción directa** de los videos desde la interfaz  
- 📥 **Descarga rápida** de archivos  
- 📱 **Código QR** para conexión fácil desde el móvil  
- 💻 **Diseño responsivo** compatible con cualquier dispositivo  

---

## ⚙️ Requisitos

- 🟣 [Bun](https://bun.sh/) – para ejecutar el servidor  
- 🌐 [Ngrok](https://ngrok.com/) – solo si quieres acceder desde fuera de tu red local  

---

## 🚀 Cómo usar

### 1️⃣ Clonar el repositorio

```bash
git clone https://github.com/tuusuario/vlink.git
cd vlink
```

### 2️⃣ Iniciar el servidor

```bash
bun server.js
```

Por defecto, el servidor se ejecuta en [http://localhost:3000](http://localhost:3000) 🖥️

---

## 📲 Acceder desde el móvil (usando Ngrok)

¿Quieres conectar tu teléfono fácilmente? Sigue estos pasos:

1. Instala Ngrok: [Descargar aquí](https://ngrok.com/)  
2. Inicia un túnel al puerto donde corre el servidor (por ejemplo, el 3000):

   ```bash
   ngrok http 3000
   ```

3. Ngrok te mostrará una URL pública como `https://xxxx.ngrok.io` 🌍  
4. Abre esa URL en tu teléfono o escanea el código QR generado en la app.

---

## 📝 Licencia

Distribuido bajo la licencia MIT.

---

👨‍💻 Hecho con ❤️ por Teo en Ecuador 🇪🇨

