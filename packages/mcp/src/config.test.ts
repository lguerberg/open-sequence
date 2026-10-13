import { describe, expect, test } from 'vitest';
import { ConfigError, readConfig, readHttpConfig, readLogLevel, readTransport } from './config.js';

describe('readConfig', () => {
  test('names OPENSEQUENCE_URL when it is missing', () => {
    expect(() => readConfig({ OPENSEQUENCE_API_KEY: 'sk_live_x' })).toThrow(
      /^OPENSEQUENCE_URL is not set/
    );
  });

  test('names OPENSEQUENCE_API_KEY when it is missing or blank', () => {
    expect(() => readConfig({ OPENSEQUENCE_URL: 'https://seq.example.com' })).toThrow(
      /^OPENSEQUENCE_API_KEY is not set/
    );
    expect(() =>
      readConfig({ OPENSEQUENCE_URL: 'https://seq.example.com', OPENSEQUENCE_API_KEY: '  ' })
    ).toThrow(ConfigError);
  });

  test('refuses a URL without a scheme, without echoing the key', () => {
    let message = '';
    try {
      readConfig({ OPENSEQUENCE_URL: 'seq.example.com', OPENSEQUENCE_API_KEY: 'sk_live_secret' });
    } catch (err) {
      message = (err as Error).message;
    }
    expect(message).toContain('must start with http');
    expect(message).not.toContain('sk_live_secret');
  });

  test('returns both values, trimmed', () => {
    expect(
      readConfig({
        OPENSEQUENCE_URL: ' https://seq.example.com ',
        OPENSEQUENCE_API_KEY: 'sk_live_x\n',
      })
    ).toEqual({ url: 'https://seq.example.com', apiKey: 'sk_live_x' });
  });
});

describe('readHttpConfig', () => {
  test('needs only OPENSEQUENCE_URL; listens on 0.0.0.0:8080/mcp by default', () => {
    expect(readHttpConfig({ OPENSEQUENCE_URL: 'https://seq.example.com' })).toEqual({
      url: 'https://seq.example.com',
      host: '0.0.0.0',
      port: 8080,
      path: '/mcp',
    });
  });

  test('takes HOST, PORT and MCP_PATH', () => {
    expect(
      readHttpConfig({
        OPENSEQUENCE_URL: 'http://api:3000',
        HOST: '127.0.0.1',
        PORT: '9090',
        MCP_PATH: '/v1/mcp',
      })
    ).toEqual({ url: 'http://api:3000', host: '127.0.0.1', port: 9090, path: '/v1/mcp' });
  });

  test('does not need OPENSEQUENCE_API_KEY, and names a missing URL', () => {
    expect(() => readHttpConfig({})).toThrow(/^OPENSEQUENCE_URL is not set/);
  });

  test('refuses a port that is not a number and a path without a slash', () => {
    expect(() => readHttpConfig({ OPENSEQUENCE_URL: 'http://a', PORT: 'eighty' })).toThrow(
      /^PORT must be a port number/
    );
    expect(() => readHttpConfig({ OPENSEQUENCE_URL: 'http://a', PORT: '70000' })).toThrow(
      ConfigError
    );
    expect(() => readHttpConfig({ OPENSEQUENCE_URL: 'http://a', MCP_PATH: 'mcp' })).toThrow(
      /^MCP_PATH must start with "\/"/
    );
  });
});

describe('readTransport', () => {
  test('http unless asked for stdio', () => {
    expect(readTransport([], {})).toBe('http');
    expect(readTransport([], { MCP_TRANSPORT: '' })).toBe('http');
    expect(readTransport(['--stdio'], {})).toBe('stdio');
    expect(readTransport([], { MCP_TRANSPORT: 'STDIO' })).toBe('stdio');
  });

  test('a flag beats the variable', () => {
    expect(readTransport(['--stdio'], { MCP_TRANSPORT: 'http' })).toBe('stdio');
    expect(readTransport(['--http'], { MCP_TRANSPORT: 'stdio' })).toBe('http');
  });

  test('names a transport it does not know', () => {
    expect(() => readTransport([], { MCP_TRANSPORT: 'sse' })).toThrow(
      'MCP_TRANSPORT must be "stdio" or "http" (got "sse").'
    );
  });
});

describe('readLogLevel', () => {
  test('info by default; one of the known levels otherwise', () => {
    expect(readLogLevel({})).toBe('info');
    expect(readLogLevel({ LOG_LEVEL: 'DEBUG' })).toBe('debug');
    expect(() => readLogLevel({ LOG_LEVEL: 'verbose' })).toThrow(/^LOG_LEVEL must be one of/);
  });
});
