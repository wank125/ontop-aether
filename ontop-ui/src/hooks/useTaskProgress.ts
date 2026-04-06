"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { tasks, type TaskProgress } from "@/lib/api";

interface UseTaskProgressOptions {
  dsId: string;
  taskType: string;
  pollInterval?: number; // ms, default 2000
  idleInterval?: number; // ms, default 5000 — slower polling when no task / completed
  onComplete?: (task: TaskProgress) => void;
  onFail?: (task: TaskProgress) => void;
}

interface UseTaskProgressResult {
  task: TaskProgress | null;
  isRunning: boolean;
  refetch: () => void;
}

export function useTaskProgress({
  dsId,
  taskType,
  pollInterval = 2000,
  idleInterval = 5000,
  onComplete,
  onFail,
}: UseTaskProgressOptions): UseTaskProgressResult {
  const [task, setTask] = useState<TaskProgress | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mountedRef = useRef(true);
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

  // When a running task is detected, poll faster; otherwise idle
  useEffect(() => {
    const interval = isRunning ? pollInterval : idleInterval;
    startTimer(interval);
    return () => {
      clearTimer();
    };
  }, [dsId, taskType, isRunning, pollInterval, idleInterval, startTimer, clearTimer]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refetch = useCallback(() => {
    startTimer(isRunning ? pollInterval : idleInterval);
  }, [startTimer, isRunning, pollInterval, idleInterval]);

  return { task, isRunning, refetch };
}
