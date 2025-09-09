/**
 * OAuth 2.0 Client with PKCE implementation for Drupal Simple OAuth 5.x
 */

import { createHash, randomBytes } from 'crypto';
import type { Server } from 'http';
import { createServer } from 'http';
import { parse } from 'url';

export interface OAuthConfig {
  clientId: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresIn?: number;
  scope?: string;
}

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

/**
 * OAuth 2.0 client with PKCE support for terminal environments
 */
export class OAuthClient {
  private readonly config: OAuthConfig;
  private readonly server?: Server;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Generate PKCE code verifier and challenge
   */
  generatePKCEChallenge(): PKCEChallenge {
    const codeVerifier = randomBytes(32).toString('base64url');
    const codeChallenge = createHash('sha256')
      .update(codeVerifier)
      .digest('base64url');

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Start OAuth authorization flow
   */
  async authorize(): Promise<OAuthTokens> {
    const pkce = this.generatePKCEChallenge();
    const state = randomBytes(16).toString('hex');

    try {
      // Try localhost server first
      const authCode = await this.authorizeWithServer(pkce, state);
      return await this.exchangeCodeForTokens(authCode, pkce.codeVerifier);
    } catch (error) {
      console.error(
        'Localhost server failed, falling back to manual entry:',
        error
      );
      return await this.authorizeManually(pkce, state);
    }
  }

  /**
   * OAuth flow using localhost HTTP server
   */
  private async authorizeWithServer(
    pkce: PKCEChallenge,
    state: string
  ): Promise<string> {
    const FALLBACK_PORTS = [3000, 3001, 0]; // 0 = OS-assigned

    for (const port of FALLBACK_PORTS) {
      try {
        const server = await this.createAuthServer(state);
        const serverPort = await this.startServer(server, port);

        const authUrl = this.buildAuthorizationUrl({
          ...pkce,
          state,
          redirectUri: `http://127.0.0.1:${serverPort}/callback`,
        });

        console.log(`Opening authorization URL: ${authUrl}`);
        try {
          const { default: open } = await import('open');
          await open(authUrl);
        } catch {
          console.log(
            'Browser auto-open failed. Please manually open the URL above.'
          );
        }

        const authCode = await this.waitForAuthCode(server);
        return authCode;
      } catch (error) {
        if (port === FALLBACK_PORTS[FALLBACK_PORTS.length - 1]) {
          throw error;
        }
        continue;
      }
    }

    throw new Error('All ports failed');
  }

  /**
   * Manual OAuth flow for restricted environments
   */
  private async authorizeManually(
    pkce: PKCEChallenge,
    state: string
  ): Promise<OAuthTokens> {
    const authUrl = this.buildAuthorizationUrl({
      ...pkce,
      state,
      redirectUri: this.config.redirectUri,
    });

    console.log('\n=== Manual Authorization Required ===');
    console.log('1. Open this URL in your browser:');
    console.log(`   ${authUrl}`);
    console.log('2. Complete authorization');
    console.log('3. Copy the authorization code from the response');
    console.log('=====================================\n');

    // In a real implementation, you'd prompt for user input here
    // For this example, we'll throw an error to indicate manual intervention needed
    throw new Error('Manual authorization code entry required');
  }

  /**
   * Create HTTP server for OAuth callback
   */
  private createAuthServer(expectedState: string): Promise<Server> {
    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => {
        const url = parse(req.url || '', true);

        if (url.pathname === '/callback') {
          const { code, state, error } = url.query;

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(
              `<html><body><h1>Authorization Failed</h1><p>Error: ${error}</p></body></html>`
            );
            return;
          }

          if (state !== expectedState) {
            res.writeHead(400, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h1>Authorization Failed</h1><p>Invalid state parameter</p></body></html>'
            );
            return;
          }

          if (code) {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(
              '<html><body><h1>Authorization Successful</h1><p>You can close this window.</p></body></html>'
            );
            (server as typeof server & { authCode?: string }).authCode = code;
            server.close();
          }
        } else {
          res.writeHead(404);
          res.end('Not found');
        }
      });

      server.on('error', reject);
      resolve(server);
    });
  }

  /**
   * Start server on specified port
   */
  private startServer(server: Server, port: number): Promise<number> {
    return new Promise((resolve, reject) => {
      server.listen(port, '127.0.0.1', () => {
        const address = server.address();
        if (address && typeof address === 'object') {
          resolve(address.port);
        } else {
          reject(new Error('Failed to get server port'));
        }
      });

      server.on('error', reject);
    });
  }

  /**
   * Wait for authorization code from callback
   */
  private waitForAuthCode(server: Server): Promise<string> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        server.close();
        reject(new Error('Authorization timeout'));
      }, 120000); // 2 minutes

      server.on('close', () => {
        clearTimeout(timeout);
        const { authCode } = server as typeof server & { authCode?: string };
        if (authCode) {
          resolve(authCode as string);
        } else {
          reject(new Error('No authorization code received'));
        }
      });
    });
  }

  /**
   * Build authorization URL with PKCE parameters
   */
  private buildAuthorizationUrl(params: {
    codeChallenge: string;
    codeChallengeMethod: string;
    state: string;
    redirectUri: string;
  }): string {
    const url = new URL(this.config.authorizationEndpoint);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', params.redirectUri);
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', params.state);
    url.searchParams.set('code_challenge', params.codeChallenge);
    url.searchParams.set('code_challenge_method', params.codeChallengeMethod);

    return url.toString();
  }

  /**
   * Exchange authorization code for access tokens
   */
  private async exchangeCodeForTokens(
    code: string,
    codeVerifier: string
  ): Promise<OAuthTokens> {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.config.redirectUri,
      code_verifier: codeVerifier,
    });

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token,
      tokenType: tokenData.token_type || 'Bearer',
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    };
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    const fetch = globalThis.fetch || (await import('node-fetch')).default;

    const body = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: this.config.clientId,
      refresh_token: refreshToken,
    });

    const response = await fetch(this.config.tokenEndpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token refresh failed: ${response.status} ${errorText}`);
    }

    const tokenData = await response.json();

    return {
      accessToken: tokenData.access_token,
      refreshToken: tokenData.refresh_token || refreshToken, // Keep old if new not provided
      tokenType: tokenData.token_type || 'Bearer',
      expiresIn: tokenData.expires_in,
      scope: tokenData.scope,
    };
  }
}
