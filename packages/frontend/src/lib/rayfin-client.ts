//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import {
  RayfinClient,
  resolveRayfinConfig,
} from '@microsoft/rayfin-client';
import { browserSession } from '@microsoft/rayfin-auth';
import { dataService } from '@microsoft/rayfin-data';
import { functionsService } from '@microsoft/rayfin-functions';
import { connectorsService } from '@microsoft/rayfin-connectors';
import type { AppFunctionsSchema } from '@rayfin-app/functions/types';
import type { UniversalAppSchema } from '@rayfin-app/shared';
import {
  connectorConfigs,
  connectorRuntimes,
  type AppConnectorsSchema,
} from './connectors';

export type AppClient = Awaited<ReturnType<typeof createClient>>;

let _client: Promise<AppClient> | undefined;

export class MissingRayfinConfigError extends Error {
  constructor(readonly missing: readonly string[]) {
    super(`Missing required Rayfin configuration: ${missing.join(', ')}`);
    this.name = 'MissingRayfinConfigError';
  }
}

/** Returns the app's typed data, auth, functions, and connector client. */
export async function getRayfinClient(): Promise<AppClient> {
  if (!_client) {
    _client = createClient().catch((error) => {
      _client = undefined;
      throw error;
    });
  }

  return _client;
}

async function createClient() {
  const resolved = await resolveRayfinConfig({
    apiUrl: import.meta.env.VITE_RAYFIN_API_URL || undefined,
    publishableKey: import.meta.env.VITE_RAYFIN_PUBLISHABLE_KEY,
    workspaceId: import.meta.env.VITE_FABRIC_WORKSPACE_ID,
    itemId: import.meta.env.VITE_FABRIC_ITEM_ID,
    portalUrl: import.meta.env.VITE_FABRIC_PORTAL_URL,
  });

  if (typeof resolved.baseUrl !== 'string' || !resolved.publishableKey?.trim()) {
    throw new MissingRayfinConfigError([
      ...(typeof resolved.baseUrl !== 'string' ? ['apiUrl'] : []),
      ...(!resolved.publishableKey?.trim() ? ['publishableKey'] : []),
    ]);
  }

  return RayfinClient.create({
    baseUrl: resolved.baseUrl,
    publishableKey: resolved.publishableKey,
    runtimeConfig: resolved.runtimeConfig,
    auth: browserSession({ storage: true }),
    services: {
      data: dataService<UniversalAppSchema>(),
      functions: functionsService<AppFunctionsSchema>(),
      connectors: connectorsService<AppConnectorsSchema>({
        configs: connectorConfigs,
        runtime: connectorRuntimes,
      }),
    },
  });
}

if (import.meta.hot) {
  import.meta.hot.dispose(async () => {
    await _client?.then(client => client.dispose());
    _client = undefined;
  });
}
