const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { Server } = require("socket.io");
const { createServer } = require("http");
const cors = require("cors");

const app = express();
const httpServer = createServer(app);

app.use(
  cors({
    origin: "http://localhost:3001",
  })
);

interface IUser {
  username: string;
  userId: string;
}
interface IMessage {
  author: IUser | undefined;
  content: string;
  type: "SYSTEM" | "USER";
}
interface IRoom {
  id: string;
  users: Array<string>;
  message: Array<IMessage>;
}

const systemUser: IUser = { userId: "0", username: "system" };

const io = new Server(httpServer, {
  /* options */
  cors: {
    origin: ["http://localhost:3001", "http://localhost:3000"],
  },
});

const Rooms: Array<IRoom> = [];
const Users: Array<IUser> = [];

app.get("/getUser/:id", (req, res) => {
  res.json(Users.find((user) => user.userId == req.params.id)).status(200);
});

function GetRoom(roomId): { roomIndex: number; room: IRoom } {
  const roomIndex = Rooms.findIndex((room) => room.id == roomId);
  const room = Rooms[roomIndex];
  return { roomIndex, room };
}
function GetUser(socket): IUser {
  return Users[Users.findIndex((user) => user.userId == socket.userId)];
}
function SendMessage(roomId: string, message: IMessage): void {
  const data = GetRoom(roomId);
  data.room.message.push(message);
  Rooms.splice(data.roomIndex, 1, data.room);
}
function disconnectFromRoom(socket): void {
  const room = GetRoom(socket.roomId);
  room.room.users.splice(
    Users.findIndex((user) => user.userId == socket.userId),
    1
  );
  if (room.room.users.length == 0) {
    Rooms.splice(room.roomIndex, 1);
    Users.splice(
      Users.findIndex((user) => user.userId == socket.userId),
      1
    );
    socket.roomId = null;
    socket.userId = null;
    socket.username = null;
  } else {
    Rooms.splice(room.roomIndex, 1, room.room);
    Users.splice(
      Users.findIndex((user) => user.userId == socket.userId),
      1
    );
    socket.roomId = null;
    socket.userId = null;
    socket.username = null;
  }
}

io.on("connection", (socket) => {
  socket.on("systemEvent_getUserInfo", (username: string, fn: any) => {
    try {
      if (Users.find((user) => user.username == username)) return;
      const user: IUser = {
        userId: uuidv4(),
        username: username,
      };
      Users.push(user);
      socket.username = username;
      socket.userId = user.userId;
      fn(user);
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("userEvent_connectToRoom", (roomId: string) => {
    try {
      if (Rooms.find((room: IRoom) => room.id == roomId)) {
        const data = GetRoom(roomId);
        Rooms.splice(data.roomIndex, 1, {
          ...data.room,
          users: [...data.room.users, GetUser(socket).userId],
        });
        socket.join(roomId);
        socket.roomId = roomId;
        SendMessage(roomId, {
          author: systemUser,
          content: GetUser(socket).username + " connect to room!",
          type: "SYSTEM",
        });
      } else {
        const room: IRoom = { id: roomId, message: [], users: [socket.userId] };
        Rooms.push(room);
        socket.join(roomId);
        socket.roomId = roomId;
        SendMessage(roomId, {
          author: systemUser,
          content: GetUser(socket).username + " connect to room!",
          type: "SYSTEM",
        });
      }
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("userEvent_disconnectFromRoom", () => {
    try {
      disconnectFromRoom(socket);
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("userEvent_sendMessage", (content: string) => {
    try {
      SendMessage(socket.roomId, {
        author: Users.find((user) => user.userId == socket.userId),
        content,
        type: "USER",
      });
    } catch (error) {
      console.log(error);
    }
  });

  const interval = setInterval(() => {
    try {
      if (socket.roomId) {
        const data = GetRoom(socket.roomId);
        socket.emit(
          "userEvent_sendMessageClient",
          Rooms[data.roomIndex].message
        );
      }
    } catch (error) {
      console.log(error);
    }
  }, 100);
});

io.on("disconnecting", (socket) => {
  try {
    if (socket.roomId) {
      disconnectFromRoom(socket);
    }
  } catch (error) {
    console.log(error);
  }
});

httpServer.listen(9000, () => {});
