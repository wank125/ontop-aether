"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { tasks, type TaskProgress } from "@/lib/api";

interface UseTaskProgressOptions {
  dsId: string;
  taskType: string;
  pollInterval?: number; // ms, default 2000
  idleInterval?: number; // ms, default 30000 — slower polling when no task / completed
  onComplete?: (task: TaskProgress) => void;
  onFail?: (task: TaskProgress) => void;
}

interface UseTaskProgressResult {
  task: TaskProgress | null;
  isRunning: boolean;
  refetch: () => void;
}

// Max idle time before we stop polling entirely (10 minutes)
const IDLE_TIMEOUT_MS = 600_000;

export function useTaskProgress({
  dsId,
  taskType,
  pollInterval = 2000,
  idleInterval = 30_000,
  onComplete,
  onFail,
}: UseTaskProgressOptions): UseTaskProgressResult {
  const [task, setTask] = useState<TaskProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
  const skipPollingRef = useRef(false);
  const idleStartRef = useRef<number>(Date.now());

  // Stable refs for callbacks
  const onCompleteRef = useRef(onComplete);
  const onFailRef = useRef(onFail);
  onCompleteRef.current = onComplete;
  onFailRef.current = onFail;
  const dsIdRef = useRef(dsId);
  const taskTypeRef = useRef(taskType);
  dsIdRef.current = dsId;
  taskTypeRef.current = taskType;

  const clearTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const startTimer = useCallback(
    (interval: number) => {
      clearTimer();
      const poll = async () => {
        if (skipPollingRef.current || !mountedRef.current) return;
        const id = dsIdRef.current;
        const tt = taskTypeRef.current;
        if (!id) return;
        try {
          const data = await tasks.get(id, tt);
          if (!mountedRef.current) return;
          // Backend returns {status:'none'} when no task exists
          if (!data || !data.id || data.status === "none") {
            setTask(null);
            setIsRunning(false);
            return;
          }
          setTask(data);
          const running = data.status === "running";
          setIsRunning(running);
          if (!running) {
            if (data.status === "completed") onCompleteRef.current?.(data);
            if (data.status === "failed") onFailRef.current?.(data);
          }
        } catch {
          if (mountedRef.current) {
            setTask(null);
            setIsRunning(false);
          }
        }
      };
      // Initial immediate poll, then recurring
      poll();
      timerRef.current = setInterval(poll, interval);
    },
    [clearTimer],
  );

  // When running → fast poll; when idle → slow poll with idle timeout
  useEffect(() => {
    if (skipPollingRef.current) return;

    if (isRunning) {
      idleStartRef.current = Date.now();
      startTimer(pollInterval);
    } else {
      // Check if we've been idle too long → stop completely
      const idleMs = Date.now() - idleStartRef.current;
      if (idleMs >= IDLE_TIMEOUT_MS) {
        clearTimer();
        return;
      }
      startTimer(idleInterval);
    }
    return () => {
      clearTimer();
    };
  }, [dsId, taskType, isRunning, pollInterval, idleInterval, startTimer, clearTimer]);

  // Mark idle start when task stops running
  useEffect(() => {
    if (!isRunning) {
      idleStartRef.current = Date.now();
    }
  }, [isRunning]);

  // Page visibility: stop polling when hidden, resume when visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        skipPollingRef.current = true;
        clearTimer();
      } else {
        skipPollingRef.current = false;
        // Reset idle timer on resume so we get a fresh cycle
        idleStartRef.current = Date.now();
        // Immediately poll and restart timer
        startTimer(isRunning ? pollInterval : idleInterval);
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [isRunning, pollInterval, idleInterval, startTimer, clearTimer]);

  // Cleanup on unmount
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  const refetch = useCallback(() => {
    idleStartRef.current = Date.now();
    skipPollingRef.current = false;
    startTimer(isRunning ? pollInterval : idleInterval);
  }, [startTimer, isRunning, pollInterval, idleInterval]);

  return { task, isRunning, refetch };
}
