// Test-only sentinels. Never load a hosted database or real service credentials.
process.env.NODE_ENV = "test";
process.env.MONGO_URI = "mongodb://127.0.0.1:1/never_used_test_sentinel";
process.env.REDIS_URL = "redis://127.0.0.1:1/0";
process.env.FIREBASE_PROJECT_ID = "demo-isolated-test";
process.env.FIREBASE_CLIENT_EMAIL = "test@demo-isolated-test.iam.gserviceaccount.com";
process.env.FIREBASE_PRIVATE_KEY = "test-only-sentinel-not-a-real-key";
