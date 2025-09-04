/**
 * Example test file to verify Jest configuration
 */

describe('Development tooling integration test', () => {
  it('should pass a basic test', () => {
    expect(true).toBe(true);
  });

  it('should handle async operations', async () => {
    const asyncOperation = async (): Promise<string> => {
      return Promise.resolve('test result');
    };

    const result = await asyncOperation();
    expect(result).toBe('test result');
  });

  it('should work with TypeScript types', () => {
    interface TestInterface {
      id: number;
      name: string;
    }

    const testObject: TestInterface = {
      id: 1,
      name: 'test',
    };

    expect(testObject.id).toBe(1);
    expect(testObject.name).toBe('test');
  });
});