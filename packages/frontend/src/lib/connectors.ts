// #region rayfin:app-owned — copied verbatim by the Rayfin CLI; edit freely.
//-----------------------------------------------------------------------
// <copyright company="Microsoft Corporation">
//        Copyright (c) Microsoft Corporation.  All rights reserved.
//        Licensed under the MIT license. See LICENSE file in the project root for full license information.
// </copyright>
//-----------------------------------------------------------------------

import type {
  ConnectorConfig,
  ConnectorsRuntime,
} from '@microsoft/rayfin-connectors';
// #endregion rayfin:app-owned

// App-owned connector registration for the composed client.

import { fabricSemanticModel } from '@microsoft/rayfin-connector-fabric-semanticmodel';

import { connectorConfig as coffeesalesConfig, type CoffeesalesSchema as coffeesalesSchema } from '../../../../rayfin/connectors/coffeesales/schema';

export type AppConnectorsSchema = {
  'coffeesales': coffeesalesSchema;
};

export const connectorConfigs = {
  'coffeesales': coffeesalesConfig,
} satisfies Record<keyof AppConnectorsSchema, ConnectorConfig>;

export const connectorRuntimes: ConnectorsRuntime = {
  'coffeesales': fabricSemanticModel(),
};
