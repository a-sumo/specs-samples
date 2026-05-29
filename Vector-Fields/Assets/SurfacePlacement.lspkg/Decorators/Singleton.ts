/**
 * Specs Inc. 2026
 * Singleton pattern decorator for TypeScript classes. Ensures single instance creation with lazy
 * initialization, provides getInstance() static method for global access, preserves prototype chain
 * for instanceof checks, and manages instance lifecycle with automatic caching on first construction.
 *
 * A decorator function to make a class a singleton.
 *
 * @param constructor
 */
export function Singleton<T extends new (...args: any[]) => any>(
  constructor: T
): T {
  let _instance: InstanceType<T> | null = null;

  const newConstructor: any = function (...args: any[]) {
    if (!_instance) {
      _instance = new constructor(...args);
    }
    return _instance;
  };

  // Copy prototype so instanceof operator still works
  newConstructor.prototype = constructor.prototype;

  // Add the static `getInstance` method to the decorated class
  newConstructor.getInstance = function () {
    if (!_instance) {
      _instance = new constructor();
    }
    return _instance!;
  };

  return newConstructor;
}
