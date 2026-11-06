import { loadWorkspace as readWorkspace } from '@rayfin-app/shared';
import { getRayfinClient } from './rayfin-client';
export async function loadWorkspace() {
  return readWorkspace((await getRayfinClient()).data);
}
