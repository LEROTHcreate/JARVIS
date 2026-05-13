export type Role = "user" | "assistant";

export interface ChatMessage {
  id: string;
  role: Role;
  content: string;
  /** Data URL d'une image jointe par l'utilisateur (jamais sur les messages assistant). */
  image?: string;
}

export type JarvisState =
  | "idle"
  | "listening"
  | "thinking"
  | "speaking"
  | "music";

export interface MapPin {
  name: string;
  lat: number;
  lng: number;
  description?: string;
}

export interface UserLocation {
  lat: number;
  lng: number;
}

export interface PinsEvent {
  type: "pins";
  pins: MapPin[];
}

export interface DeltaEvent {
  type: "delta";
  text: string;
}

export type StreamEvent = DeltaEvent | PinsEvent;
