import { PacketType, type ParsedPacket } from '../../lib/rscPacketParser';

const GRID_SIZE = 32;
const GRID_COLS = 16; // 512 / 32
const GRID_ROWS = 10; // 320 / 32 (leaving 14px for status bar)

export class RSCRenderer {
  private ctx: CanvasRenderingContext2D;
  private playerX = 8;
  private playerY = 5;
  private npcs: Map<number, { x: number; y: number }> = new Map();

  constructor(ctx: CanvasRenderingContext2D) {
    this.ctx = ctx;
  }

  clear(): void {
    this.ctx.fillStyle = '#0a0a0a';
    this.ctx.fillRect(0, 0, 512, 334);
  }

  drawGrid(): void {
    this.ctx.strokeStyle = '#1a1a1a';
    this.ctx.lineWidth = 0.5;

    // Vertical lines
    for (let x = 0; x <= GRID_COLS; x++) {
      this.ctx.beginPath();
      this.ctx.moveTo(x * GRID_SIZE, 0);
      this.ctx.lineTo(x * GRID_SIZE, GRID_ROWS * GRID_SIZE);
      this.ctx.stroke();
    }

    // Horizontal lines
    for (let y = 0; y <= GRID_ROWS; y++) {
      this.ctx.beginPath();
      this.ctx.moveTo(0, y * GRID_SIZE);
      this.ctx.lineTo(GRID_COLS * GRID_SIZE, y * GRID_SIZE);
      this.ctx.stroke();
    }
  }

  drawPlayer(x: number, y: number): void {
    const px = x * GRID_SIZE + GRID_SIZE / 2;
    const py = y * GRID_SIZE + GRID_SIZE / 2;

    // Green circle
    this.ctx.fillStyle = '#14F195';
    this.ctx.beginPath();
    this.ctx.arc(px, py, 10, 0, Math.PI * 2);
    this.ctx.fill();

    // Label
    this.ctx.fillStyle = '#e5e5e5';
    this.ctx.font = '9px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText('YOU', px, py + 20);
  }

  drawNPC(x: number, y: number, npcId: number): void {
    const px = x * GRID_SIZE + GRID_SIZE / 2;
    const py = y * GRID_SIZE + GRID_SIZE / 2;

    // Red circle
    this.ctx.fillStyle = '#ff4444';
    this.ctx.beginPath();
    this.ctx.arc(px, py, 8, 0, Math.PI * 2);
    this.ctx.fill();

    // Label
    this.ctx.fillStyle = '#888';
    this.ctx.font = '8px sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.fillText(`NPC ${npcId}`, px, py + 18);
  }

  drawStatusBar(): void {
    // Status bar at bottom
    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, GRID_ROWS * GRID_SIZE, 512, 14);

    this.ctx.fillStyle = '#666';
    this.ctx.font = '10px sans-serif';
    this.ctx.textAlign = 'left';
    this.ctx.fillText(`Pos: (${this.playerX}, ${this.playerY})`, 8, GRID_ROWS * GRID_SIZE + 10);

    this.ctx.textAlign = 'right';
    this.ctx.fillText(`NPCs: ${this.npcs.size}`, 504, GRID_ROWS * GRID_SIZE + 10);
  }

  handlePacket(packet: ParsedPacket): void {
    switch (packet.type) {
      case PacketType.PLAYER_POSITION:
        this.playerX = packet.payload.x;
        this.playerY = packet.payload.y;
        break;

      case PacketType.NPC_SPAWN:
        this.npcs.set(packet.payload.npcId, {
          x: packet.payload.x,
          y: packet.payload.y,
        });
        break;

      case PacketType.GAME_STATE:
        console.log('[RSCRenderer] Game state:', packet.payload);
        break;
    }
  }

  render(): void {
    this.clear();
    this.drawGrid();

    // Draw NPCs
    this.npcs.forEach((pos, npcId) => {
      this.drawNPC(pos.x, pos.y, npcId);
    });

    // Draw player on top
    this.drawPlayer(this.playerX, this.playerY);

    // Draw status bar
    this.drawStatusBar();
  }

  getPlayerPosition(): { x: number; y: number } {
    return { x: this.playerX, y: this.playerY };
  }
}
