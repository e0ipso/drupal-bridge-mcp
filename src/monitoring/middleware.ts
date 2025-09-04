/**
 * Performance monitoring middleware for Express applications
 *
 * Automatically tracks response times, request counts, and errors
 */

import type { Request, Response, NextFunction } from 'express';
import { metricsCollector } from './metrics.js';
import { logger } from '@/utils/logger.js';

/**
 * Performance monitoring middleware
 *
 * Records metrics for all HTTP requests passing through the application
 */
export function performanceMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Track active connection
  metricsCollector.incrementConnections();

  // Use the 'finish' event instead of overriding res.end
  res.on('finish', () => {
    const responseTime = Date.now() - startTime;

    // Record the performance metric
    metricsCollector.recordPerformance({
      timestamp: startTime,
      responseTime,
      endpoint: req.path,
      method: req.method,
      statusCode: res.statusCode,
    });

    // Decrement active connections
    metricsCollector.decrementConnections();

    // Log slow requests
    if (responseTime > 1000) {
      logger.warn('Slow request detected', {
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
      });
    }

    // Log errors
    if (res.statusCode >= 400) {
      logger.warn('HTTP error response', {
        method: req.method,
        path: req.path,
        responseTime: `${responseTime}ms`,
        statusCode: res.statusCode,
        userAgent: req.get('User-Agent'),
      });
    }
  });

  next();
}

/**
 * Request logging middleware
 *
 * Logs incoming requests with structured data
 */
export function requestLoggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  logger.debug('Incoming request', {
    method: req.method,
    path: req.path,
    userAgent: req.get('User-Agent'),
    ip: req.ip ?? req.connection.remoteAddress,
    timestamp: new Date().toISOString(),
  });

  next();
}
