import mongoose from 'mongoose';

/**
 * Atomic sequence generator backing the gate pass number. `findOneAndUpdate`
 * with `$inc` and `upsert` is race-free across concurrent requests and
 * horizontally scaled API instances — safer than counting documents.
 */
const counterSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true },
    seq: { type: Number, default: 0 },
  },
  { timestamps: true }
);

counterSchema.statics.next = async function next(key) {
  const doc = await this.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
  return doc.seq;
};

export default mongoose.model('Counter', counterSchema);
