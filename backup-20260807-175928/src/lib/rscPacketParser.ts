export enum PacketType {
  PLAYER_POSITION = 1,
  NPC_SPAWN = 2,
  GAME_STATE = 3,
}

export interface ParsedPacket {
  type: PacketType;
  payload: any;
}

export function parsePacket(data: ArrayBuffer): ParsedPacket {
  const view = new DataView(data);
  const type = view.getUint8(0) as PacketType;

  switch (type) {
    case PacketType.PLAYER_POSITION: {
      const x = view.getUint16(1);
      const y = view.getUint16(3);
      return { type, payload: { x, y } };
    }

    case PacketType.NPC_SPAWN: {
      const x = view.getUint16(1);
      const y = view.getUint16(3);
      const npcId = view.getUint16(5);
      return { type, payload: { x, y, npcId } };
    }

    case PacketType.GAME_STATE: {
      const jsonStr = new TextDecoder().decode(new Uint8Array(data, 1));
      try {
        return { type, payload: JSON.parse(jsonStr) };
      } catch {
        return { type, payload: { raw: jsonStr } };
      }
    }

    default:
      return { type, payload: { raw: data } };
  }
}

export function createMovePacket(x: number, y: number): ArrayBuffer {
  const buffer = new ArrayBuffer(5);
  const view = new DataView(buffer);
  view.setUint8(0, PacketType.PLAYER_POSITION);
  view.setUint16(1, x);
  view.setUint16(3, y);
  return buffer;
}
