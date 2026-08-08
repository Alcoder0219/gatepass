import asyncHandler from '../../../utils/asyncHandler.js';
import { sendSuccess } from '../../../utils/ApiResponse.js';
import { getDashboardStats } from '../services/leaveDashboard.service.js';

/** GET /leave/dashboard/stats */
export const getStats = asyncHandler(async (req, res) => {
  const data = await getDashboardStats(req.user);
  return sendSuccess(res, { data, message: 'Leave dashboard loaded' });
});

export default { getStats };
