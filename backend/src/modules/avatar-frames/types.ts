export interface CreateAvatarFrameInput {
  name: string;
  imageUrl: string;
  price?: number;
  tags?: string[];
  defaultOffsetX?: number;
  defaultOffsetY?: number;
  defaultScale?: number;
  defaultRotation?: number;
}

export interface CalibrationInput {
  offsetX?: number;
  offsetY?: number;
  scale?: number;
  rotation?: number;
}
