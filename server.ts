import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  createRoom,
  joinRoom,
  startGame,
  rollRoulette,
  chooseBranch,
  useItem,
  equipGear,
  combatCommand,
  recoverAtVillage,
  buyShopItem,
  sellInventory,
  changeJob,
  endTurn,
  getPublicRoom,
  disconnectPlayer,
  rooms,
} from "./src/server/gameEngine";

const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT ?? 3000);
const app = next({ dev, hostname, port });
const handler = app.getRequestHandler();

app.prepare().then(() => {
  const httpServer = createServer(handler);
  const io = new Server(httpServer, { cors: { origin: "*" } });

  const emitRoom = (roomCode: string) => {
    const room = getPublicRoom(roomCode);
    if (room) io.to(roomCode).emit("room:update", room);
  };

  io.on("connection", (socket) => {
    socket.on("room:create", ({ name, playerId }, cb) => {
      const result = createRoom(name, playerId);
      socket.join(result.room.code);
      socket.data.roomCode = result.room.code;
      socket.data.playerId = result.playerId;
      cb?.({ ok: true, roomCode: result.room.code, playerId: result.playerId });
      emitRoom(result.room.code);
    });

    socket.on("room:join", ({ roomCode, name, playerId }, cb) => {
      const result = joinRoom(roomCode, name, playerId);
      if (!result.ok) return cb?.(result);
      socket.join(roomCode.toUpperCase());
      socket.data.roomCode = roomCode.toUpperCase();
      socket.data.playerId = "playerId" in result ? result.playerId : playerId;
      cb?.(result);
      emitRoom(roomCode.toUpperCase());
    });

    socket.on("game:start", ({ roomCode, playerId }, cb) => {
      const result = startGame(roomCode, playerId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("turn:roll", ({ roomCode, playerId }, cb) => {
      const result = rollRoulette(roomCode, playerId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("turn:end", ({ roomCode, playerId }, cb) => {
      const result = endTurn(roomCode, playerId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("branch:choose", ({ roomCode, playerId, choice }, cb) => {
      const result = chooseBranch(roomCode, playerId, choice);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("item:use", ({ roomCode, playerId, itemId }, cb) => {
      const result = useItem(roomCode, playerId, itemId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("gear:equip", ({ roomCode, playerId, gearId }, cb) => {
      const result = equipGear(roomCode, playerId, gearId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("combat:command", ({ roomCode, playerId, command, itemId }, cb) => {
      const result = combatCommand(roomCode, playerId, command, itemId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("village:recover", ({ roomCode, playerId }, cb) => {
      const result = recoverAtVillage(roomCode, playerId);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("shop:buy", ({ roomCode, playerId, itemKey }, cb) => {
      const result = buyShopItem(roomCode, playerId, itemKey);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("inventory:sell", ({ roomCode, playerId, id }, cb) => {
      const result = sellInventory(roomCode, playerId, id);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("job:change", ({ roomCode, playerId, job }, cb) => {
      const result = changeJob(roomCode, playerId, job);
      cb?.(result);
      emitRoom(roomCode);
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode;
      const playerId = socket.data.playerId;
      if (roomCode && playerId) {
        disconnectPlayer(roomCode, playerId);
        emitRoom(roomCode);
      }
    });
  });

  httpServer.listen(port, () => {
    console.log(`RPG Sugoroku Party ready on http://localhost:${port}`);
  });
});
