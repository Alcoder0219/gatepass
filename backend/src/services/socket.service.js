import { Server } from 'socket.io';
import env from '../config/env.js';
import logger from '../utils/logger.js';
import { verifyAccessToken } from '../utils/tokens.js';
import { SOCKET_EVENT, socketRooms } from '../constants/index.js';
import User from '../models/User.js';

let io = null;

/**
 * Socket.io with a JWT handshake. Every connected user is auto-joined to three
 * rooms: their own (`user:<id>`), their role (`role:<KEY>`) and their unit
 * (`unit:<id>`) — so a notification can be addressed to a person, a whole role
 * (e.g. every guard at the gate) or a site.
 */
export const initSocket = (httpServer) => {
  io = new Server(httpServer, {
    cors: { origin: env.clientUrl, credentials: true },
    pingTimeout: 30_000,
  });

  io.use(async (socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        socket.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) return next(new Error('Authentication token missing'));

      const payload = verifyAccessToken(token);
      const user = await User.findById(payload.sub).populate('role', 'key name').lean();
      if (!user || user.status !== 'ACTIVE') return next(new Error('Unauthorised socket connection'));

      socket.user = {
        id: user._id.toString(),
        name: user.name,
        role: user.role?.key,
        unit: user.unit?.toString(),
      };
      return next();
    } catch {
      return next(new Error('Invalid socket token'));
    }
  });

  io.on('connection', (socket) => {
    const { id, role, unit, name } = socket.user;
    socket.join(socketRooms.user(id));
    if (role) socket.join(socketRooms.role(role));
    if (unit) socket.join(socketRooms.unit(unit));

    logger.debug(`Socket connected: ${name} (${role}) — ${socket.id}`);

    socket.on('disconnect', (reason) => {
      logger.debug(`Socket disconnected: ${name} — ${reason}`);
    });
  });

  logger.info('Socket.io initialised');
  return io;
};

export const getIo = () => io;

/** Emit to a single user across all of their open tabs / devices. */
export const emitToUser = (userId, event, payload) => {
  if (!io || !userId) return;
  io.to(socketRooms.user(userId.toString())).emit(event, payload);
};

/** Emit to everyone holding a role — e.g. the whole security desk. */
export const emitToRole = (roleKey, event, payload) => {
  if (!io || !roleKey) return;
  io.to(socketRooms.role(roleKey)).emit(event, payload);
};

export const emitToUnit = (unitId, event, payload) => {
  if (!io || !unitId) return;
  io.to(socketRooms.unit(unitId.toString())).emit(event, payload);
};

export const emitToAll = (event, payload) => {
  if (!io) return;
  io.emit(event, payload);
};

export { SOCKET_EVENT };

export default { initSocket, getIo, emitToUser, emitToRole, emitToUnit, emitToAll };
