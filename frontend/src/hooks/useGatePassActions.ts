import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import confetti from 'canvas-confetti';
import { gatePassApi } from '@/services/endpoints';
import { errorMessage } from '@/services/api';
import type { GatePass } from '@/types';

/** Brand palette — the confetti has to look like it belongs to this product. */
const CONFETTI_COLORS = ['#6366f1', '#06b6d4', '#8b5cf6'];

/** Every surface that can be stale after a workflow decision. */
const AFFECTED_KEYS = [['gate-passes'], ['dashboard'], ['hr'], ['security']] as const;

/**
 * Fires the celebration from wherever the user actually clicked, so the burst
 * feels attached to the button rather than to the middle of the screen.
 */
export const celebrate = (origin?: HTMLElement | null) => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const rect = origin?.getBoundingClientRect();
  const x = rect ? (rect.left + rect.width / 2) / window.innerWidth : 0.5;
  const y = rect ? (rect.top + rect.height / 2) / window.innerHeight : 0.6;

  void confetti({
    particleCount: 70,
    spread: 68,
    startVelocity: 32,
    gravity: 0.9,
    scalar: 0.9,
    ticks: 160,
    colors: CONFETTI_COLORS,
    origin: { x, y },
    disableForReducedMotion: true,
  });
};

export interface CommentVars {
  id: string;
  comment: string;
}

export interface ApproveVars {
  id: string;
  comment?: string;
  /** The button that was pressed — the confetti launches from it. */
  origin?: HTMLElement | null;
}

/**
 * The one place a gate pass decision is made. Every screen (detail, approvals
 * queue, HR, security) mutates through this hook, so the invalidations, the
 * toasts and the celebration are identical no matter where the click happened.
 */
export const useGatePassActions = () => {
  const queryClient = useQueryClient();

  const invalidate = useCallback(() => {
    for (const key of AFFECTED_KEYS) {
      void queryClient.invalidateQueries({ queryKey: key });
    }
  }, [queryClient]);

  const onFailure = (error: unknown) => toast.error(errorMessage(error));

  const approve = useMutation<GatePass, unknown, ApproveVars>({
    mutationFn: ({ id, comment }) => gatePassApi.approve(id, comment ?? ''),
    onSuccess: (gatePass, { origin }) => {
      celebrate(origin);
      toast.success(`${gatePass.gatePassNumber} approved`);
      invalidate();
    },
    onError: onFailure,
  });

  const reject = useMutation<GatePass, unknown, CommentVars>({
    mutationFn: ({ id, comment }) => gatePassApi.reject(id, comment),
    onSuccess: (gatePass) => {
      toast.success(`${gatePass.gatePassNumber} rejected`);
      invalidate();
    },
    onError: onFailure,
  });

  const requestChanges = useMutation<GatePass, unknown, CommentVars>({
    mutationFn: ({ id, comment }) => gatePassApi.requestChanges(id, comment),
    onSuccess: (gatePass) => {
      toast.success(`Changes requested on ${gatePass.gatePassNumber}`);
      invalidate();
    },
    onError: onFailure,
  });

  const cancel = useMutation<GatePass, unknown, { id: string; comment?: string }>({
    mutationFn: ({ id, comment }) => gatePassApi.cancel(id, comment ?? ''),
    onSuccess: (gatePass) => {
      toast.success(`${gatePass.gatePassNumber} cancelled`);
      invalidate();
    },
    onError: onFailure,
  });

  const remove = useMutation<null, unknown, { id: string }>({
    mutationFn: ({ id }) => gatePassApi.remove(id),
    onSuccess: () => {
      toast.success('Gate pass deleted');
      invalidate();
    },
    onError: onFailure,
  });

  return {
    approve,
    reject,
    requestChanges,
    cancel,
    remove,
    isPending:
      approve.isPending ||
      reject.isPending ||
      requestChanges.isPending ||
      cancel.isPending ||
      remove.isPending,
  };
};

export default useGatePassActions;
