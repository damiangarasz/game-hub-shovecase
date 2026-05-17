import { rtdb } from "./firebase";
import {
  ref,
  set,
  push,
  onValue,
  off,
  remove,
  serverTimestamp,
  runTransaction,
  query,
  orderByChild,
  equalTo,
  onDisconnect,
  get,
  update,
} from "@react-native-firebase/database";
import type {
  PlayerInfo,
  Position,
  PieceColor,
  MatchmakingEntry,
} from "../games/makruk/logic/makruk.types";

// Typy dla naszego Backendu
export interface RematchState {
  hostWantsRematch: boolean;
  guestWantsRematch: boolean;
  nextGameId: string | null;
  declinedBy: "host" | "guest" | null;
}

export interface TimeControl {
  totalTime: number; // milliseconds
  increment: number;
}

export interface LobbyRoom {
  id: string;
  host: PlayerInfo;
  guest: PlayerInfo | null;
  timeControl: "3min" | "5min" | "10min";
  status:
    | "waiting"
    | "ready"
    | "playing"
    | "checkmate"
    | "stalemate"
    | "draw_by_counting"
    | "draw"
    | "resigned_host"
    | "resigned_guest"
    | "timeout_host"
    | "timeout_guest";
  whoWon: "white" | "black" | "draw" | null;
  createdAt: object; // serverTimestamp
  lastMove?: GameMove; // Ostatni ruch w grze
  // Game timer fields
  whiteTimeLeft?: number; // milliseconds remaining for white
  blackTimeLeft?: number; // milliseconds remaining for black
  lastMoveTimestamp?: number; // server timestamp when last move was made
  currentTurnStartTime?: number; // server timestamp when current turn started
  // Disconnect timer fields
  hostConnection?: "online" | "offline";
  guestConnection?: "online" | "offline";
  hostTimeLeft?: number; // milliseconds
  guestTimeLeft?: number; // milliseconds
  lastDisconnectTimestamp?: number | null;
  // Draw offer state
  drawOffer?: "host" | "guest" | null;
  // Rematch state
  rematch?: RematchState;
}

export interface GameMove {
  from: Position;
  to: Position;
  color: PieceColor;
  notation: string; // LAN notation (np. "e2e4")
  timestamp: number | object;
}

let serverOffset = 0;
const offsetRef = ref(rtdb, ".info/serverTimeOffset");
let offsetUnsubscribe: (() => void) | null = null;

export const initializeServerOffset = () => {
  if (offsetUnsubscribe) return; // Already initialized

  offsetUnsubscribe = onValue(offsetRef, (snap) => {
    serverOffset = snap.val() || 0;
  });
};

export const cleanupServerOffset = () => {
  if (offsetUnsubscribe) {
    offsetUnsubscribe();
    offsetUnsubscribe = null;
  }
};

//Returns current server time (local time + Firebase offset)
export const getCurrentServerTime = () => Date.now() + serverOffset;

//Converts time control preset to TimeControl object
export const getTimeControlConfig = (
  preset: "3min" | "5min" | "10min",
): TimeControl => {
  switch (preset) {
    case "3min":
      return { totalTime: 3 * 60 * 1000, increment: 2000 }; // 3min + 2s
    case "5min":
      return { totalTime: 5 * 60 * 1000, increment: 3000 }; // 5min + 3s
    case "10min":
      return { totalTime: 10 * 60 * 1000, increment: 5000 }; // 10min + 5s
  }
};

/**
 * Create new lobby
 * Remove if Player disconnect
 */
export const createLobby = async (
  host: PlayerInfo,
  timeControl: "3min" | "5min" | "10min",
): Promise<string> => {
  const lobbiesRef = ref(rtdb, "lobbies");
  const newLobbyRef = push(lobbiesRef); // Generuje unikalny ID

  const timeConfig = getTimeControlConfig(timeControl);

  const roomData = {
    host,
    guest: null,
    timeControl,
    status: "waiting",
    whoWon: null,
    createdAt: serverTimestamp(),
    whiteTimeLeft: timeConfig.totalTime,
    blackTimeLeft: timeConfig.totalTime,
    lastMoveTimestamp: null,
    currentTurnStartTime: null,
  };

  await set(newLobbyRef, roomData);

  await onDisconnect(newLobbyRef).remove();

  return newLobbyRef.key as string;
};

export const joinLobby = async (
  roomId: string,
  guest: PlayerInfo,
): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  const result = await runTransaction(roomRef, (room) => {
    if (!room) {
      return;
    }

    if (room.host?.id === guest.id) {
      return;
    }

    if (room.guest) {
      return;
    }

    // Update
    room.guest = guest;
    room.status = "ready";

    return room;
  });

  // Check reason of transaction terminated
  if (!result.committed) {
    const room = result.snapshot.val();

    if (!room) {
      throw new Error("Room not found or deleted");
    }

    if (room.host?.id === guest.id) {
      throw new Error("You cannot join your own room");
    }

    if (room.guest) {
      throw new Error("Room is already fulll");
    }

    throw new Error("Failed to join room");
  }
};

export const deleteLobby = async (roomId: string): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);
  await remove(roomRef);
};

export const updateLobbyStatus = async (
  roomId: string,
  status: "waiting" | "ready" | "playing",
): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  await runTransaction(roomRef, (room) => {
    if (!room) return;

    room.status = status;

    // Initialize game timer when starting
    if (status === "playing") {
      room.currentTurnStartTime = serverTimestamp();
      room.lastMoveTimestamp = serverTimestamp();
    }

    return room;
  });
};

export const kickGuestFromLobby = async (roomId: string): Promise<void> => {
  const guestRef = ref(rtdb, `lobbies/${roomId}/guest`);
  await set(guestRef, null);
};

export const subscribeToRoom = (
  roomId: string,
  callback: (room: LobbyRoom | null) => void,
) => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  const unsubscribe = onValue(roomRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      callback(null);
      return;
    }

    callback({
      id: roomId,
      ...data,
    });
  });

  return () => unsubscribe();
};

//Listen only for rooms with waiting status
export const subscribeToLobbies = (
  callback: (lobbies: LobbyRoom[]) => void,
) => {
  const lobbiesRef = ref(rtdb, "lobbies");

  const waitingLobbiesQuery = query(
    lobbiesRef,
    orderByChild("status"),
    equalTo("waiting"),
  );

  const unsubscribe = onValue(waitingLobbiesQuery, (snapshot) => {
    const data = snapshot.val();

    if (!data) {
      callback([]);
      return;
    }

    const lobbiesList = Object.keys(data).map((key) => ({
      id: key,
      ...data[key],
    }));

    callback(lobbiesList);
  });

  return () => unsubscribe();
};

export const sendMoveToRoom = async (
  roomId: string,
  from: Position,
  to: Position,
  color: PieceColor,
  notation: string,
  whiteTimeLeft: number,
  blackTimeLeft: number,
): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  const move: GameMove = {
    from,
    to,
    color,
    notation,
    timestamp: serverTimestamp(),
  };

  // Update multiple fields atomically
  await runTransaction(roomRef, (room) => {
    if (!room) return;

    room.lastMove = move;
    room.whiteTimeLeft = whiteTimeLeft;
    room.blackTimeLeft = blackTimeLeft;
    room.lastMoveTimestamp = serverTimestamp();
    room.currentTurnStartTime = serverTimestamp();

    return room;
  });
};

//Initializes connection tracking and disconnect handlers when game starts

export const initializeGameConnectionHandlers = async (
  roomId: string,
  role: "host" | "guest",
): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  // Cancel the remove() testament from createLobby!!!
  await onDisconnect(roomRef).cancel();

  // Initialize connection fields
  const connectionField =
    role === "host" ? "hostConnection" : "guestConnection";
  const timeLeftField = role === "host" ? "hostTimeLeft" : "guestTimeLeft";

  const connectionRef = ref(rtdb, `lobbies/${roomId}/${connectionField}`);
  const timeLeftRef = ref(rtdb, `lobbies/${roomId}/${timeLeftField}`);
  const timestampRef = ref(rtdb, `lobbies/${roomId}/lastDisconnectTimestamp`);

  // Set initial values
  await set(connectionRef, "online");
  await set(timeLeftRef, 15000); // 15 seconds default

  // Set up onDisconnect handlers
  await onDisconnect(connectionRef).set("offline");
  await onDisconnect(timestampRef).set(serverTimestamp());
};

export const subscribeToConnectionStatus = (
  callback: (isConnected: boolean) => void,
) => {
  const connectedRef = ref(rtdb, ".info/connected");

  const unsubscribe = onValue(connectedRef, (snapshot) => {
    const isConnected = snapshot.val() === true;
    callback(isConnected);
  });

  return () => unsubscribe();
};

export const handleReconnection = async (
  roomId: string,
  role: "host" | "guest",
  lastDisconnectTimestamp: number,
  currentTimeLeft: number,
): Promise<void> => {
  const connectionField =
    role === "host" ? "hostConnection" : "guestConnection";
  const timeLeftField = role === "host" ? "hostTimeLeft" : "guestTimeLeft";

  // Calculate time spent offline
  const correctedTime = getCurrentServerTime();
  const timeOffline = correctedTime - lastDisconnectTimestamp;
  const newTimeLeft = Math.max(0, currentTimeLeft - timeOffline);

  // Update Firebase
  const connectionRef = ref(rtdb, `lobbies/${roomId}/${connectionField}`);
  const timeLeftRef = ref(rtdb, `lobbies/${roomId}/${timeLeftField}`);

  await set(connectionRef, "online");
  await set(timeLeftRef, newTimeLeft);
};

export const executeTimeout = async (
  roomId: string,
  timedOutRole: "host" | "guest",
): Promise<void> => {
  const newStatus = timedOutRole === "host" ? "timeout_host" : "timeout_guest";

  await updateGameStatus(roomId, newStatus);
};

export const updateGameStatus = async (
  roomId: string,
  status:
    | "checkmate"
    | "stalemate"
    | "draw_by_counting"
    | "draw"
    | "resigned_host"
    | "resigned_guest"
    | "timeout_host"
    | "timeout_guest",
): Promise<void> => {
  const statusRef = ref(rtdb, `lobbies/${roomId}/status`);
  await set(statusRef, status);
};

export const offerDraw = async (
  roomId: string,
  role: "host" | "guest",
): Promise<void> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);

  const result = await runTransaction(roomRef, (room) => {
    if (!room) {
      return;
    }

    // Prevent offering draw if game is already over
    const terminalStatuses = [
      "checkmate",
      "stalemate",
      "draw_by_counting",
      "draw",
      "resigned_host",
      "resigned_guest",
      "timeout_host",
      "timeout_guest",
    ];

    if (terminalStatuses.includes(room.status)) {
      return;
    }

    // Set the draw offer to the caller's role
    room.drawOffer = role;

    return room;
  });

  if (!result.committed) {
    throw new Error("Failed to offer draw");
  }
};

export const acceptDraw = async (
  roomId: string,
  role: "host" | "guest",
): Promise<boolean> => {
  const roomRef = ref(rtdb, `lobbies/${roomId}`);
  const opponentRole = role === "host" ? "guest" : "host";

  const result = await runTransaction(roomRef, (room) => {
    if (!room) {
      return;
    }

    // Verify that the opponent (not us) offered the draw
    if (room.drawOffer !== opponentRole) {
      return;
    }

    // Clear the draw offer
    room.drawOffer = null;

    return room;
  });

  if (!result.committed) {
    return false;
  }

  // Transaction committed - now update status to draw
  await updateGameStatus(roomId, "draw");

  return true;
};

export const declineDraw = async (roomId: string): Promise<void> => {
  const drawOfferRef = ref(rtdb, `lobbies/${roomId}/drawOffer`);

  await runTransaction(drawOfferRef, (currentDrawOffer) => {
    // Clear the draw offer regardless of current value (idempotent)

    return null;
  });
};

export const requestRematch = async (
  roomId: string,
  role: "host" | "guest",
): Promise<void> => {
  const rematchRef = ref(rtdb, `lobbies/${roomId}/rematch`);

  const result = await runTransaction(rematchRef, (currentRematch) => {
    // Initialize rematch state if it doesn't exist
    if (!currentRematch) {
      currentRematch = {
        hostWantsRematch: false,
        guestWantsRematch: false,
        nextGameId: null,
        declinedBy: null,
      };
    }

    // Check if opponent declined
    if (currentRematch.declinedBy) {
      return;
    }

    // Check if rematch already created
    if (currentRematch.nextGameId) {
      return;
    }

    // Set our rematch flag
    if (role === "host") {
      currentRematch.hostWantsRematch = true;
    } else {
      currentRematch.guestWantsRematch = true;
    }

    return currentRematch;
  });

  if (!result.committed) {
    throw new Error("Failed to request rematch");
  }
};

export const declineRematch = async (
  roomId: string,
  role: "host" | "guest",
): Promise<void> => {
  const rematchRef = ref(rtdb, `lobbies/${roomId}/rematch`);

  await runTransaction(rematchRef, (currentRematch) => {
    if (!currentRematch) {
      currentRematch = {
        hostWantsRematch: false,
        guestWantsRematch: false,
        nextGameId: null,
        declinedBy: null,
      };
    }

    currentRematch.declinedBy = role;

    return currentRematch;
  });
};

export const createRematchGame = async (
  oldRoomId: string,
  oldRoom: LobbyRoom,
): Promise<string> => {
  if (!oldRoom.guest) {
    throw new Error("Cannot create rematch without a guest");
  }

  const oldRematchRef = ref(rtdb, `lobbies/${oldRoomId}/rematch`);

  // Transaction is the ONLY place where we decide if a new room should be created
  const result = await runTransaction(oldRematchRef, (currentRematch) => {
    // Initialize rematch state if missing
    if (!currentRematch) {
      currentRematch = {
        hostWantsRematch: false,
        guestWantsRematch: false,
        nextGameId: null,
        declinedBy: null,
      };
    }

    // If nextGameId already exists, abort - another client already created the room
    if (currentRematch.nextGameId) {
      return;
    }

    // Check if both players want rematch
    const bothAgree =
      currentRematch.hostWantsRematch && currentRematch.guestWantsRematch;

    // If both don't agree yet, abort - we're not the second player
    if (!bothAgree) {
      return;
    }

    const lobbiesRef = ref(rtdb, "lobbies");
    const newLobbyRef = push(lobbiesRef);
    const newGameId = newLobbyRef.key as string;

    // Set nextGameId atomically within the transaction
    currentRematch.nextGameId = newGameId;

    return currentRematch; // commit transaction
  });

  // If transaction was aborted, check if nextGameId was already set by opponent
  if (!result.committed) {
    const existingRematch = result.snapshot.val() as RematchState | null;

    if (existingRematch?.nextGameId) {
      // Another client already created the room - return their ID

      return existingRematch.nextGameId;
    }

    // Both players don't agree yet - this shouldn't happen if called correctly
    throw new Error("Cannot create rematch - both players must agree first");
  }

  // Transaction committed - WE are the creator
  const newGameId = result.snapshot.val().nextGameId;

  // Create the actual room in Firebase
  const newLobbyRef = ref(rtdb, `lobbies/${newGameId}`);

  // Swap colors - previous guest becomes new host (white)
  const newHost: PlayerInfo = {
    ...oldRoom.guest,
    color: "white",
  };

  const newGuest: PlayerInfo = {
    ...oldRoom.host,
    color: "black",
  };

  const timeConfig = getTimeControlConfig(oldRoom.timeControl);

  const newRoomData = {
    host: newHost,
    guest: newGuest,
    timeControl: oldRoom.timeControl,
    status: "playing",
    createdAt: serverTimestamp(),
    whiteTimeLeft: timeConfig.totalTime,
    blackTimeLeft: timeConfig.totalTime,
    lastMoveTimestamp: serverTimestamp(),
    currentTurnStartTime: serverTimestamp(),
  };

  await set(newLobbyRef, newRoomData);

  return newGameId;
};

export const deleteRoom = async (roomId: string): Promise<void> => {
  try {
    const roomRef = ref(rtdb, `lobbies/${roomId}`);

    // First check if the room still exists (idempotency check)
    const snapshot = await get(roomRef);

    if (!snapshot.exists()) {
      return;
    }

    await remove(roomRef);
  } catch (error) {
    // Network errors, permission errors, or null reference errors

    console.warn(
      `Could not delete room ${roomId} (may already be deleted):`,
      error,
    );
  }
};

export const joinMatchmakingQueue = async (
  playerInfo: PlayerInfo,
  timeControl: "3min" | "5min" | "10min",
): Promise<void> => {
  try {
    const matchmakingQueueRef = ref(
      rtdb,
      `matchmakingQueue/${timeControl}/${playerInfo.id}`,
    );
    const newMatchmakingEntry = {
      id: playerInfo.id,
      elo: playerInfo.elo,
      nickname: playerInfo.nickname,
      status: "searching",
      roomId: null,
      role: null,
      eloTolerance: 50,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await set(matchmakingQueueRef, newMatchmakingEntry);

    await onDisconnect(matchmakingQueueRef).remove();
  } catch (e) {
    console.warn("błąd w połączeniu z rtdb:", e);
  }
};

export const updateMatchmakingTolerance = async (
  uid: string,
  timeControl: "3min" | "5min" | "10min",
  newTolerance: number,
): Promise<void> => {
  const queueRef = ref(rtdb, `matchmakingQueue/${timeControl}/${uid}`);
  await update(queueRef, {
    eloTolerance: newTolerance,
    updatedAt: serverTimestamp(),
  });
};

export const subscribeToMatchmakingQueue = (
  uid: string,
  timeControl: "3min" | "5min" | "10min",
  callback: (matchmakingEntry: MatchmakingEntry | null) => void,
) => {
  const matchmakingQueueRef = ref(
    rtdb,
    `matchmakingQueue/${timeControl}/${uid}`,
  );

  const unsubscribe = onValue(matchmakingQueueRef, (snapshot) => {
    const matchmakingEntry = snapshot.val() as MatchmakingEntry | null;

    if (!matchmakingEntry) {
      callback(null);
      return;
    }

    callback(matchmakingEntry);
  });

  return () => unsubscribe();
};

export const leaveMatchmakingQueue = async (
  uid: string,
  timeControl: "3min" | "5min" | "10min",
): Promise<boolean> => {
  const matchmakingQueueRef = ref(
    rtdb,
    `matchmakingQueue/${timeControl}/${uid}`,
  );

  const result = await runTransaction(
    matchmakingQueueRef,
    (currentMatchmakingEntry) => {
      if (currentMatchmakingEntry?.roomId == null) {
        return null;
      }
      return;
    },
  );
  if (!result.committed) {
    return false;
  } else {
    return true;
  }
};

export const heartBeatMatchmakingQueue = async (
  uid: string,
  timeControl: "3min" | "5min" | "10min",
): Promise<void> => {
  const matchmakingQueueRef = ref(
    rtdb,
    `matchmakingQueue/${timeControl}/${uid}`,
  );
  await update(matchmakingQueueRef, {
    updatedAt: serverTimestamp(),
  });
};
