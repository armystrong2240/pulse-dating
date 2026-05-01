import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";

const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

const makePeer = () => new RTCPeerConnection({ iceServers: ICE_SERVERS });

export const LivePage = () => {
  const socket = useSocket();
  const { user } = useAuth();
  const [rooms, setRooms] = useState([]);
  const [title, setTitle] = useState("");
  const [activeRoom, setActiveRoom] = useState(null); // { id, title, isHost }
  const [error, setError] = useState("");

  const localVideoRef = useRef(null);
  const remoteVideoRef = useRef(null);
  const localStreamRef = useRef(null);
  const viewerPeersRef = useRef({}); // viewerSocketId → RTCPeerConnection (host)
  const hostPeerRef = useRef(null); // RTCPeerConnection (viewer)

  // Load room list
  useEffect(() => {
    api.get("/live/rooms").then((r) => setRooms(r.data));
  }, []);

  // Realtime room updates
  useEffect(() => {
    const onStarted = (room) => setRooms((prev) => [room, ...prev]);
    const onCount = ({ roomId, viewers }) =>
      setRooms((prev) =>
        prev.map((r) => (r.id === roomId ? { ...r, viewers } : r)),
      );
    socket.on("live:room_started", onStarted);
    socket.on("live:viewer-count", onCount);
    return () => {
      socket.off("live:room_started", onStarted);
      socket.off("live:viewer-count", onCount);
    };
  }, [socket]);

  // HOST: a viewer joined — create peer and send offer
  useEffect(() => {
    const onViewerJoined = async ({ viewerSocketId }) => {
      if (!localStreamRef.current) return;
      const peer = makePeer();
      viewerPeersRef.current[viewerSocketId] = peer;

      localStreamRef.current
        .getTracks()
        .forEach((t) => peer.addTrack(t, localStreamRef.current));

      peer.onicecandidate = (e) => {
        if (e.candidate)
          socket.emit("live:ice-candidate", {
            target: viewerSocketId,
            candidate: e.candidate,
          });
      };

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit("live:offer", { viewerSocketId, sdp: offer });
    };

    const onAnswer = async ({ viewerSocketId, sdp }) => {
      const peer = viewerPeersRef.current[viewerSocketId];
      if (peer) await peer.setRemoteDescription(new RTCSessionDescription(sdp));
    };

    socket.on("live:viewer-joined", onViewerJoined);
    socket.on("live:answer", onAnswer);
    return () => {
      socket.off("live:viewer-joined", onViewerJoined);
      socket.off("live:answer", onAnswer);
    };
  }, [socket]);

  // VIEWER: receive offer and send answer
  useEffect(() => {
    const onOffer = async ({ hostSocketId, sdp }) => {
      const peer = makePeer();
      hostPeerRef.current = peer;

      peer.onicecandidate = (e) => {
        if (e.candidate)
          socket.emit("live:ice-candidate", {
            target: hostSocketId,
            candidate: e.candidate,
          });
      };

      peer.ontrack = (e) => {
        if (remoteVideoRef.current)
          remoteVideoRef.current.srcObject = e.streams[0];
      };

      await peer.setRemoteDescription(new RTCSessionDescription(sdp));
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      socket.emit("live:answer", { hostSocketId, sdp: answer });
    };

    const onHostGone = () => {
      setError("The host ended the stream.");
      setActiveRoom(null);
      if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;
      hostPeerRef.current?.close();
      hostPeerRef.current = null;
    };

    socket.on("live:offer", onOffer);
    socket.on("live:host-disconnected", onHostGone);
    return () => {
      socket.off("live:offer", onOffer);
      socket.off("live:host-disconnected", onHostGone);
    };
  }, [socket]);

  // Shared ICE candidate handler
  useEffect(() => {
    const onIce = async ({ from, candidate }) => {
      const peer =
        viewerPeersRef.current[from] || hostPeerRef.current;
      if (peer && candidate) {
        try {
          await peer.addIceCandidate(new RTCIceCandidate(candidate));
        } catch {
          // ignore stale candidates
        }
      }
    };
    socket.on("live:ice-candidate", onIce);
    return () => socket.off("live:ice-candidate", onIce);
  }, [socket]);

  const startStream = async (e) => {
    e.preventDefault();
    if (!title.trim()) return;
    try {
      setError("");
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      localStreamRef.current = stream;
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
        localVideoRef.current.muted = true;
      }
      const { data: room } = await api.post("/live/start", { title });
      socket.emit("live:host-room", { roomId: room.id, userId: user.id });
      setActiveRoom({ ...room, isHost: true });
      setTitle("");
    } catch (err) {
      setError(err.message || "Could not access camera/microphone");
    }
  };

  const joinStream = (room) => {
    setError("");
    socket.emit("live:join-room", { roomId: room.id });
    setActiveRoom({ ...room, isHost: false });
  };

  const stopStream = async () => {
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    Object.values(viewerPeersRef.current).forEach((p) => p.close());
    viewerPeersRef.current = {};
    hostPeerRef.current?.close();
    hostPeerRef.current = null;
    if (activeRoom?.isHost) {
      await api.delete(`/live/rooms/${activeRoom.id}`).catch(() => {});
    }
    setActiveRoom(null);
  };

  if (activeRoom) {
    return (
      <section className="page">
        <div className="live-session">
          <div className="live-header">
            <h2>{activeRoom.title}</h2>
            <span className="live-badge">● LIVE</span>
            <button className="btn-secondary" onClick={stopStream}>
              {activeRoom.isHost ? "End Stream" : "Leave"}
            </button>
          </div>

          {activeRoom.isHost && (
            <video
              ref={localVideoRef}
              autoPlay
              playsInline
              className="live-video"
            />
          )}
          {!activeRoom.isHost && (
            <video
              ref={remoteVideoRef}
              autoPlay
              playsInline
              className="live-video"
            />
          )}

          {error && <p className="error">{error}</p>}
        </div>
      </section>
    );
  }

  return (
    <section className="page">
      <h2>Live Streams</h2>
      <p className="muted">Start a live session or join someone's stream.</p>

      {error && <p className="error">{error}</p>}

      <form className="inline-form" onSubmit={startStream}>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Give your stream a title"
        />
        <button className="btn-primary" type="submit">
          Go Live
        </button>
      </form>

      <div className="live-grid">
        {rooms.map((room) => (
          <article className="live-card" key={room.id}>
            <h3>{room.title}</h3>
            <p className="muted">Host: {room.hostName}</p>
            <p>{room.viewers} watching</p>
            <button className="btn-secondary" onClick={() => joinStream(room)}>
              Watch
            </button>
          </article>
        ))}
        {rooms.length === 0 && (
          <p className="muted">No live streams right now. Start one!</p>
        )}
      </div>
    </section>
  );
};



