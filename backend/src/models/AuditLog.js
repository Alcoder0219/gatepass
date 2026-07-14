import mongoose from 'mongoose';
import paginate from 'mongoose-paginate-v2';
import { AUDIT_ACTIONS } from '../constants/index.js';

/** Write-once trail of every consequential action in the system. */
const auditLogSchema = new mongoose.Schema(
  {
    action: { type: String, enum: AUDIT_ACTIONS, required: true, index: true },

    actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null, index: true },
    actorName: { type: String, default: 'System' },
    actorRole: { type: String, default: '' },

    /** Polymorphic target: `entity` is the collection name, `entityId` the _id. */
    entity: { type: String, default: '', index: true },
    entityId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },
    entityLabel: { type: String, default: '' },

    description: { type: String, default: '' },
    /** Field-level diff for update actions: `{ field: { from, to } }`. */
    changes: { type: mongoose.Schema.Types.Mixed, default: null },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    method: { type: String, default: '' },
    path: { type: String, default: '' },
    status: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS', index: true },

    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', default: null, index: true },
  },
  { timestamps: true }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ actor: 1, createdAt: -1 });
auditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });

auditLogSchema.plugin(paginate);

export default mongoose.model('AuditLog', auditLogSchema);
