import { useEffect, useMemo } from "react";
import { io } from "socket.io-client";

const socketUrl = import.meta.env.VITE_API_URL || "http://localhost:4000";

export const useSocket = () => {
  const socket = useMemo(
    () =>
      io(socketUrl, {
        autoConnect: true,
      }),
    [],
  );

  useEffect(() => {
    return () => {
      socket.disconnect();
    };
  }, [socket]);

  return socket;
};
