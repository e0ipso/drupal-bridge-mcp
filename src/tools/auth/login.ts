/**
 * auth_login Tool
 *
 * Authenticates the user using device authorization grant flow
 * and establishes an authenticated session.
 */

import { z } from 'zod';
import {
  McpError,
  ErrorCode,
  type CallToolResult,
} from '@modelcontextprotocol/sdk/types.js';
import { DeviceFlowHandler } from '../../oauth/device-flow-handler.js';
import { DeviceTokenPoller } from '../../oauth/device-token-poller.js';
import { DeviceAuthUI } from '../../oauth/device-flow-ui.js';
import type { DeviceAuthResponse } from '../../oauth/device-flow-types.js';
import type { DrupalOAuthProvider } from '../../oauth/provider.js';
import debug from 'debug';

const debugOAuth = debug('mcp:oauth');
const debugTools = debug('mcp:tools');

/**
 * Input schema for auth_login tool
 * No parameters required - uses session ID from context
 */
export const authLoginSchema = z.object({});

/**
 * Context provided to the auth_login handler
 */
export interface AuthLoginContext {
  sessionId: string;
  oauthProvider: DrupalOAuthProvider;
}

type DeviceFlowStatus = 'pending' | 'success' | 'error';

interface DeviceFlowState {
  status: DeviceFlowStatus;
  deviceAuth?: DeviceAuthResponse;
  promise?: Promise<void>;
  error?: Error;
}

const deviceFlowStates = new Map<string, DeviceFlowState>();

function buildPendingResponse(deviceAuth: DeviceAuthResponse): CallToolResult {
  const payload = {
    status: 'authorization_pending',
    message:
      'Complete the OAuth device authorization using the verification URI and user code.',
    verificationUri: deviceAuth.verification_uri,
    verificationUriComplete: deviceAuth.verification_uri_complete,
    userCode: deviceAuth.user_code,
    expiresIn: deviceAuth.expires_in,
    pollInterval: deviceAuth.interval,
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
}

function buildSuccessResponse(): CallToolResult {
  const payload = {
    status: 'success',
    message: 'Authentication complete. Session is now authenticated.',
  };

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload),
      },
    ],
  };
}

export async function authLogin(
  _params: z.infer<typeof authLoginSchema>,
  context: AuthLoginContext
): Promise<CallToolResult> {
  const { sessionId, oauthProvider } = context;

  try {
    debugOAuth('Starting device flow authentication for session %s', sessionId);

    const existingState = deviceFlowStates.get(sessionId);

    if (existingState?.status === 'pending' && existingState.deviceAuth) {
      debugTools(
        'Device flow already in progress for session %s - returning pending status',
        sessionId
      );
      return buildPendingResponse(existingState.deviceAuth);
    }

    if (existingState?.status === 'success') {
      debugTools(
        'Device flow previously completed for session %s - returning success',
        sessionId
      );
      deviceFlowStates.delete(sessionId);
      return buildSuccessResponse();
    }

    if (existingState?.status === 'error' && existingState.error) {
      debugTools(
        'Device flow previously failed for session %s - clearing state',
        sessionId
      );
      deviceFlowStates.delete(sessionId);
      throw existingState.error;
    }

    const existingToken = await oauthProvider.getToken(sessionId);
    if (existingToken) {
      throw new Error('Session is already authenticated');
    }

    const config = oauthProvider.getOAuthConfig();
    const metadata = await oauthProvider.fetchOAuthMetadata();

    const handler = new DeviceFlowHandler(config, metadata);
    const deviceAuth = await handler.initiateDeviceFlow();

    DeviceAuthUI.displayAuthInstructions(deviceAuth);

    const state: DeviceFlowState = {
      status: 'pending',
      deviceAuth,
    };

    deviceFlowStates.set(sessionId, state);

    const poller = new DeviceTokenPoller(config, metadata);

    state.promise = poller
      .pollForToken(
        deviceAuth.device_code,
        deviceAuth.interval,
        deviceAuth.expires_in
      )
      .then(async tokens => {
        oauthProvider.storeSessionTokens(sessionId, tokens);
        state.status = 'success';
        debugOAuth('Device flow completed for session %s', sessionId);
        DeviceAuthUI.displaySuccess();
      })
      .catch(error => {
        const authError =
          error instanceof Error ? error : new Error(String(error));
        state.status = 'error';
        state.error = authError;
        debugOAuth(
          'Device flow failed for session %s: %s',
          sessionId,
          authError.message
        );
        DeviceAuthUI.displayError(authError.message);
      })
      .finally(() => {
        debugTools(
          'Device flow task finished for session %s with status %s',
          sessionId,
          state.status
        );
        state.promise = undefined;
      });

    return buildPendingResponse(deviceAuth);
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === 'Session is already authenticated'
    ) {
      throw new McpError(
        ErrorCode.InvalidRequest,
        'Session is already authenticated'
      );
    }

    throw new McpError(
      ErrorCode.InternalError,
      `Authentication failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}
