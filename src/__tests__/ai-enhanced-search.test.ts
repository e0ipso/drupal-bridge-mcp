import { analyzeQuery } from '../sampling/query-analyzer.js';
import { searchTutorial } from '../tools/content/search.js';
import type { DrupalOAuthProvider } from '../oauth/provider.js';
import type { DrupalConnector } from '../drupal/connector.js';

// Create mock factories to ensure fresh instances per test
const createMockOAuthProvider = () =>
  ({
    getToken: jest.fn().mockResolvedValue('mock-token'),
  }) as unknown as DrupalOAuthProvider;

const createMockDrupalConnector = () =>
  ({
    searchTutorial: jest.fn().mockResolvedValue({
      results: [
        { id: '1', title: 'Test Tutorial', body: 'Content about views' },
        { id: '2', title: 'Another Tutorial', body: 'More content' },
      ],
    }),
  }) as unknown as DrupalConnector;

describe('AI-Enhanced Search Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('without sampling capability', () => {
    it('should perform keyword search successfully', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      // Mock context without sampling capabilities
      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: undefined,
        server: undefined as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify search executed with original query
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views tutorial',
        'mock-token',
        10
      );

      // Verify metadata indicates no AI enhancement
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
      expect(response.results).toHaveLength(2);
    });
  });

  describe('with sampling capability', () => {
    it('should enhance search with AI analysis', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      // Mock server with sampling support
      const mockServer = {
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: JSON.stringify({
              optimizedKeywords: ['views', 'create'],
              contentTypes: ['tutorial'],
              drupalVersions: ['10'],
              intent: 'Learn to create Views in Drupal 10',
            }),
          },
        }),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer as any,
      };

      const result = await searchTutorial(
        { query: 'How do I create views in Drupal 10', limit: 10 },
        context
      );

      // Verify AI analysis was called
      expect(mockServer.createMessage).toHaveBeenCalled();

      // Verify search used optimized keywords
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views create',
        'mock-token',
        10
      );

      // Verify metadata shows AI enhancement
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(true);
      expect(response.metadata.intent).toBe(
        'Learn to create Views in Drupal 10'
      );
      expect(response.metadata.contentTypes).toEqual(['tutorial']);
      expect(response.metadata.drupalVersions).toEqual(['10']);
    });
  });

  describe('with AI analysis failure', () => {
    it('should fall back to keyword search on timeout', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      const mockServer = {
        createMessage: jest.fn().mockRejectedValue(new Error('Timeout')),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify search still executed with original query
      expect(mockDrupalConnector.searchTutorial).toHaveBeenCalledWith(
        'views tutorial',
        'mock-token',
        10
      );

      // Verify metadata shows no AI enhancement
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
    });

    it('should fall back on unparseable AI response', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      const mockServer = {
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: 'This is not valid JSON',
          },
        }),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify fallback to keyword search
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
    });

    it('should fall back when AI returns null', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      const mockServer = {
        createMessage: jest.fn().mockResolvedValue({
          content: {
            type: 'text',
            text: 'null',
          },
        }),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: mockServer as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify fallback to keyword search
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
    });
  });

  describe('query analyzer timeout', () => {
    it('should timeout after 5 seconds', async () => {
      const mockServer = {
        createMessage: jest
          .fn()
          .mockImplementation(
            () => new Promise(resolve => setTimeout(resolve, 10000))
          ),
      };

      const result = await analyzeQuery(
        'test query',
        { server: mockServer as any, sessionId: 'test' },
        5000 // 5 second timeout
      );

      // Should return null after timeout
      expect(result).toBeNull();
    }, 7000); // Test timeout slightly longer than query timeout
  });

  describe('capability detection scenarios', () => {
    it('should not attempt AI enhancement when server is undefined', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { sampling: { supported: true } },
        server: undefined as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify no AI enhancement
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
    });

    it('should not attempt AI enhancement when sampling capability is missing', async () => {
      const mockOAuthProvider = createMockOAuthProvider();
      const mockDrupalConnector = createMockDrupalConnector();

      const mockServer = {
        createMessage: jest.fn(),
      };

      const context = {
        sessionId: 'test-session',
        oauthProvider: mockOAuthProvider,
        drupalConnector: mockDrupalConnector,
        samplingCapabilities: { experimental: {} }, // No sampling field
        server: mockServer as any,
      };

      const result = await searchTutorial(
        { query: 'views tutorial', limit: 10 },
        context
      );

      // Verify createMessage was not called
      expect(mockServer.createMessage).not.toHaveBeenCalled();

      // Verify no AI enhancement
      const response = JSON.parse(
        (result.content[0] as { type: string; text: string }).text
      );
      expect(response.metadata.aiEnhanced).toBe(false);
    });
  });
});
