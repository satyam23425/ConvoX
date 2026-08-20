const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, "public")));

let users = {}; // username -> socket.id

io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    // User joins with username
    socket.on("join", (username) => {
        users[username] = socket.id;
        socket.username = username;

        // Notify everyone
        io.emit("serverMessage", `${username} joined the chat`);

        // Send updated users list
        io.emit("onlineUsers", Object.keys(users));

        console.log("User Joined:", username);
    });

    // Public chat
    socket.on("publicMessage", (msg) => {
        io.emit("publicMessage", {
            from: socket.username,
            text: msg,
        });
    });

    // Private chat
    socket.on("privateMessage", ({ to, text }) => {
        const receiverId = users[to];
        if (receiverId) {
            io.to(receiverId).emit("privateMessage", {
                from: socket.username,
                text,
            });
        }
    });

    // On disconnect
    socket.on("disconnect", () => {
        if (socket.username) {
            io.emit("serverMessage", `${socket.username} left the chat`);
            delete users[socket.username];
            io.emit("onlineUsers", Object.keys(users));
        }
        console.log("User disconnected:", socket.username);
    });
});

server.listen(5000, () => {
    console.log("Server running at port: 5000");
});
