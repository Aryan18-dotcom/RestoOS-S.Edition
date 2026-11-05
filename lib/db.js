import mongoose from "mongoose";

let cached = global.mongoose;

if (!cached) {
  cached = global.mongoose = { conn: null, promise: null };
}

export default async function connectToDatabase() {
  if (cached.conn) return cached.conn;
  const uri =
    process.env.MONGODB_URI ||
    (process.env.NODE_ENV !== "production"
      ? "mongodb://127.0.0.1:27017/restaurant-pos"
      : "");
  if (!uri) {
    throw new Error("Set MONGODB_URI before starting the production server");
  }

  if (!cached.promise) {
    cached.promise = mongoose.connect(uri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (error) {
    cached.promise = null;
    throw error;
  }

  return cached.conn;
}
