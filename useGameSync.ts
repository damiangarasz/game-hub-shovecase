import { useEffect, useRef } from "react";
import { Alert } from "react-native";
import {
  sendMoveToRoom,
  updateGameStatus,
  acceptDraw,
  declineDraw,
  getTimeControlConfig,
  type LobbyRoom,
} from "@/services/multiplayer.service";
import { toLAN } from "@/games/makruk/logic/notation";
import { finalizeGameWithElo } from "@/services/firebase.service";
import { PlayerInfo as PlayerInfoType } from "../../../games/makruk/logic/makruk.types";
import { useCallback } from "react";
import { FIREBASE_GAME_OVER_STATUSES } from "../constants/constants";
import { useTranslation } from "react-i18next";

export const useGameSync = (
  roomId: string | undefined,
  role: "host" | "guest" | undefined,
  room: LobbyRoom | null,
  isLobbyGame: boolean,
  gameStarted: boolean,
  gameState: any,
  currentPlayer: PlayerInfoType | null,
  opponentPlayer: PlayerInfoType | null,
  executeExternalMove: Function,
  setShowRematchOverlay: (show: boolean) => void,
  deleteRoom: (roomId: string) => Promise<void>,
  whiteTime: number,
  blackTime: number,
  isTimeout: boolean,
  timedOutColor: "white" | "black" | null,
) => {
  const lastProcessedTimestamp = useRef<number>(0);
  const hasFinalizedGameRef = useRef(false);
  const isDrawAlertShowingRef = useRef(false);
  const hasCleanedUpRoomRef = useRef(false); // Ref schowany wewnątrz hooka
  const timeoutSentRef = useRef(false); // Prevent duplicate timeout submissions
  const { t } = useTranslation();

  // Reset timeout flag when game changes
  useEffect(() => {
    timeoutSentRef.current = false;
  }, [roomId, gameStarted]);

  const isGameOver =
    isLobbyGame && room?.status
      ? FIREBASE_GAME_OVER_STATUSES.has(room.status)
      : false;

  const isGameOverRef = useRef(isGameOver);

  // Update isGameOver ref whenever it changes
  useEffect(() => {
    isGameOverRef.current = isGameOver;
  }, [isGameOver]);

  // Funkcja czyszcząca wystawiona jako API dla UI
  const cleanupRoom = useCallback(async () => {
    if (!roomId || role !== "host" || hasCleanedUpRoomRef.current) return;
    hasCleanedUpRoomRef.current = true;

    try {
      await deleteRoom(roomId);
    } catch (e) {
      console.warn(e);
    }
  }, [roomId, role, deleteRoom]);

  const handleDrawAccept = useCallback(async () => {
    if (!isLobbyGame || !roomId || !role) return;

    try {
      const success = await acceptDraw(roomId, role);
      if (success) {
      } else {
        Alert.alert(
          "Error",
          "Failed to accept draw. The offer may have been cancelled.",
        );
      }
    } catch (error) {
      console.error("Failed to accept draw:", error);
      Alert.alert("Error", "Failed to accept draw. Please try again.");
    } finally {
      isDrawAlertShowingRef.current = false;
    }
  }, [isLobbyGame, roomId, role]);

  const handleDrawDecline = useCallback(async () => {
    if (!isLobbyGame || !roomId) return;

    try {
      await declineDraw(roomId);
    } catch (error) {
      console.error("Failed to decline draw:", error);
    } finally {
      isDrawAlertShowingRef.current = false;
    }
  }, [isLobbyGame, roomId]);

  // --- EFFECT 1: Receive moves ---
  useEffect(() => {
    if (!isLobbyGame || !room || !room.lastMove || !currentPlayer) return;
    const lastMove = room.lastMove;
    if (typeof lastMove.timestamp !== "number") return;

    const isOpponentMove = lastMove.color !== currentPlayer.color;
    if (isOpponentMove && lastMove.timestamp > lastProcessedTimestamp.current) {
      executeExternalMove(lastMove.from, lastMove.to, lastMove.timestamp);
      lastProcessedTimestamp.current = lastMove.timestamp;
    }
  }, [room?.lastMove, isLobbyGame, currentPlayer, executeExternalMove]);

  const whiteTimeRef = useRef(whiteTime);
  const blackTimeRef = useRef(blackTime);
  useEffect(() => {
    whiteTimeRef.current = whiteTime;
    blackTimeRef.current = blackTime;
  }, [whiteTime, blackTime]);

  // --- EFFECT 2: Send moves ---
  useEffect(() => {
    if (!isLobbyGame || !roomId || !currentPlayer || !gameStarted || !room)
      return;
    if (gameState.moveHistory.length === 0) return;

    const lastMove = gameState.moveHistory.at(-1);
    if (
      lastMove.piece.color === currentPlayer.color &&
      lastMove.timestamp > lastProcessedTimestamp.current
    ) {
      const notation = toLAN(lastMove.from, lastMove.to);
      lastProcessedTimestamp.current = lastMove.timestamp;

      // Get time control config to add increment
      const timeConfig = getTimeControlConfig(room.timeControl);

      // Add increment to the player who just moved
      let updatedWhiteTime = whiteTimeRef.current;
      let updatedBlackTime = blackTimeRef.current;

      if (lastMove.piece.color === "white") {
        updatedWhiteTime = whiteTimeRef.current + timeConfig.increment;
      } else {
        updatedBlackTime = blackTimeRef.current + timeConfig.increment;
      }

      try {
        // Send move with updated time (including increment)
        sendMoveToRoom(
          roomId,
          lastMove.from,
          lastMove.to,
          lastMove.piece.color,
          notation,
          updatedWhiteTime,
          updatedBlackTime,
        );
      } catch (e) {
        console.warn(e);
      }
    }
  }, [
    gameState.moveHistory,
    isLobbyGame,
    roomId,
    currentPlayer,
    gameStarted,
    room?.timeControl,
  ]);

  // --- EFFECT 3: Draw Offers ---
  useEffect(() => {
    if (!isLobbyGame || !room || !role) return;
    const opponentRole = role === "host" ? "guest" : "host";

    if (room.drawOffer === opponentRole) {
      if (isDrawAlertShowingRef.current) return;
      isDrawAlertShowingRef.current = true;
      Alert.alert(
        t("draw.title"),
        t("draw.subtitle"),
        [
          {
            text: t("draw.decline"),
            style: "cancel",
            onPress: handleDrawDecline,
          },
          { text: t("draw.accept"), onPress: handleDrawAccept },
        ],
        {
          cancelable: false,
          onDismiss: () => {
            isDrawAlertShowingRef.current = false;
          },
        },
      );
    } else {
      isDrawAlertShowingRef.current = false;
    }
  }, [room?.drawOffer, isLobbyGame, role]);

  // --- EFFECT 3.5: Timeout Detection ---
  useEffect(() => {
    if (!isLobbyGame || !roomId || !gameStarted || !currentPlayer || !room)
      return;
    if (!isTimeout || timeoutSentRef.current) return;

    // Prevent duplicate submissions!!!
    timeoutSentRef.current = true;

    // Determine which role (host/guest) timed out based on their color
    const hostColor = room?.host?.color;
    const timeoutStatus =
      timedOutColor === hostColor ? "timeout_host" : "timeout_guest";
    try {
      updateGameStatus(roomId, timeoutStatus as any);
    } catch (e) {
      console.warn(e);
    }
  }, [
    isTimeout,
    timedOutColor,
    isLobbyGame,
    roomId,
    gameStarted,
    currentPlayer,
    room?.host?.color,
  ]);

  // --- EFFECT 4: Terminal States Sync ---
  useEffect(() => {
    if (!isLobbyGame || !roomId || !currentPlayer || !gameStarted) return;
    const { status, moveHistory } = gameState;
    if (
      !["checkmate", "stalemate", "draw_by_counting", "draw"].includes(status)
    )
      return;
    if (moveHistory.length === 0) return;

    const playerWhoJustMoved = moveHistory[moveHistory.length - 1].piece.color;
    if (playerWhoJustMoved === currentPlayer.color) {
      try {
        updateGameStatus(roomId, status as any);
      } catch (e) {
        console.warn(e);
      }
    }
  }, [
    gameState.status,
    gameState.moveHistory,
    isLobbyGame,
    roomId,
    currentPlayer,
    gameStarted,
  ]);

  // --- EFFECT 5: Rematch Overlay ---
  useEffect(() => {
    if (isLobbyGame && isGameOver && opponentPlayer) {
      setShowRematchOverlay(true);
    }
  }, [isLobbyGame, isGameOver, !!opponentPlayer, setShowRematchOverlay]);

  // --- EFFECT 6: ELO Finalization ---
  useEffect(() => {
    if (
      hasFinalizedGameRef.current ||
      !isLobbyGame ||
      !roomId ||
      !room ||
      !currentPlayer ||
      !opponentPlayer
    )
      return;
    if (!FIREBASE_GAME_OVER_STATUSES.has(room.status)) return;

    const shouldExecute = (() => {
      const { status } = room;
      if (["stalemate", "draw_by_counting", "draw"].includes(status))
        return role === "host";
      if (status === "checkmate")
        return (
          currentPlayer.color ===
          (gameState.currentTurn === "white" ? "black" : "white")
        );
      if (status === "resigned_host" || status === "timeout_host")
        return role === "guest";
      if (status === "resigned_guest" || status === "timeout_guest")
        return role === "host";
      return false;
    })();

    if (!shouldExecute) return;
    hasFinalizedGameRef.current = true;

    const uciMoveHistory = gameState.moveHistory.map((move: any) => {
      let uci = toLAN(move.from, move.to).replace("-", "");
      if (move.piece.type === "bia") {
        if (move.piece.color === "white" && move.to.row === 2) uci += "m";
        if (move.piece.color === "black" && move.to.row === 5) uci += "m";
      }
      return uci;
    });

    try {
      finalizeGameWithElo({
        roomId,
        status: room.status,
        currentTurn: gameState.currentTurn,
        uciMoveHistory,
        hostId: room?.host?.id || "",
        guestId: room?.guest?.id || "",
        hostColor: room?.host?.color || "white",
        guestColor: room?.guest?.color || "black",
        hostUsername: room?.host?.nickname || "unknown",
        guestUsername: room?.guest?.nickname || "unknown",
        hostAvatar: room.host.avatar,
        guestAvatar: room.guest.avatar,
        timeControl: room.timeControl,
        createdAt:
          typeof room.createdAt === "object" &&
          room.createdAt &&
          "seconds" in room.createdAt
            ? (room.createdAt.seconds as number) * 1000
            : Date.now(),
        executorRole: role,
      });
    } catch (e) {
      console.warn(e);
    }
  }, [
    isLobbyGame,
    roomId,
    room?.status,
    currentPlayer,
    opponentPlayer,
    role,
    gameState.moveHistory,
    gameState.currentTurn,
    isGameOver,
  ]);

  // --- EFFECT 7: Safety Cleanup on Unmount ---
  // CRITICAL: This effect should only run on TRUE component unmount
  // Using empty dependencies array and reading isGameOver from ref
  useEffect(() => {
    return () => {
      // Check current value of isGameOver at unmount time
      if (isGameOverRef.current) {
        // Fire-and-forget async cleanup (can't await in cleanup function)
        try {
          cleanupRoom();
        } catch (e) {
          console.warn(e);
        }
      }
    };
  }, []);

  return { cleanupRoom };
};
