import { logger } from './logger.js';

/**
 * Antrian serial sederhana untuk memastikan upload gambar diproses satu per satu.
 * Mencegah race condition pada nextRowNumber di Sheets dan duplikasi folder di Drive.
 */
export class MessageQueue {
  constructor() {
    this._queue = [];
    this._running = false;
  }

  enqueue(task) {
    this._queue.push(task);
    if (!this._running) {
      this._run();
    }
  }

  get size() {
    return this._queue.length;
  }

  async _run() {
    this._running = true;
    while (this._queue.length > 0) {
      const task = this._queue.shift();
      try {
        await task();
      } catch (error) {
        // Error sudah ditangani di dalam handleImageMessage, log di sini sebagai safety net
        logger.error('Queue task failed unexpectedly', { error: error.message });
      }
    }
    this._running = false;
  }
}
