import { model, Schema } from 'mongoose';

// No TTL: a device returning after a long outage must never replay a cash sale.
const schema = new Schema({
  actor: { type: String, required: true },
  key: { type: String, required: true },
  hash: { type: String, required: true },
  result: { type: Schema.Types.Mixed, required: true },
}, { timestamps: true });
schema.index({ actor: 1, key: 1 }, { unique: true });
export default model('WebsiteMutation', schema);
