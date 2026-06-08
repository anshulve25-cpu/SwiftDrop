# SwiftDrop 🚀

SwiftDrop is a fast, secure, peer-to-peer (P2P) file sharing application built using React, WebRTC, Socket.IO, and Node.js. It enables users to transfer files directly between devices without uploading them to a central server.

## 🌟 Features

* Direct peer-to-peer file sharing
* No file storage on servers
* Fast WebRTC-based transfers
* Unique room-based connection system
* Cross-platform support (Desktop & Mobile)
* Real-time connection establishment using Socket.IO
* Simple and intuitive user interface
* Supports large file transfers

## 🛠️ Tech Stack

### Frontend

* React
* Vite
* WebRTC
* Socket.IO Client

### Backend

* Node.js
* Express.js
* Socket.IO
* Railway

## 📦 Project Structure

```text
SwiftDrop/
├── client/
│   ├── src/
│   ├── public/
│   └── package.json
│
└── server/
    ├── index.js
    ├── package.json
    └── package-lock.json
```

## 🚀 Live Application

🔗 **Project Link:**
(https://swift-drop-two.vercel.app/)

## ⚙️ Local Setup

### Clone the Repository

```bash
git clone https://github.com/YOUR_USERNAME/SwiftDrop.git
cd SwiftDrop
```

### Backend Setup

```bash
cd server
npm install
npm start
```

### Frontend Setup

```bash
cd client
npm install
npm run dev
```

## 🔒 How It Works

1. A user creates a room.
2. A unique Room ID is generated.
3. Another user joins using the Room ID.
4. Socket.IO exchanges signaling data between peers.
5. WebRTC establishes a direct connection.
6. Files are transferred directly between devices.
7. No file data is stored on any server.

## 🎯 Use Cases

* Quick file sharing between devices
* Sharing files across different networks
* Temporary file transfers without cloud storage
* Privacy-focused file exchange

## 🚧 Future Enhancements

* End-to-end encryption
* Multiple file transfers
* Drag-and-drop support
* Transfer history
* QR code room sharing
* Resume interrupted transfers


## 🤝 Contributing

Contributions, suggestions, and feature requests are welcome.

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Open a Pull Request

## 📄 License

This project is licensed under the MIT License.

## 👨‍💻 Author

**Anshul Verma**

If you found this project useful, consider giving it a ⭐ on GitHub.
