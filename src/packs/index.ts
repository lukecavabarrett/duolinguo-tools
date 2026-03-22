import type { TargetPack } from './base';
import { defaultTargetPack } from './base';
import { japaneseTargetPack } from './ja';

export function getTargetPack(id: string): TargetPack {
  if (id === 'ja') return japaneseTargetPack;
  return defaultTargetPack;
}
