"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { tasks, type TaskProgress } from "@/lib/api";

interface UseTaskProgressOptions {
  dsId: string;
  taskType: string;
  pollInterval?: number; // ms, default 2000
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

  const stopPolling = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const fetchTask = useCallback(async () => {
    if (!dsId) return;
    try {
      const data = await tasks.get(dsId, taskType);
      if (!mountedRef.current) return;
      // Backend returns {status:'none'} when no task exists
      if (!data || !data.id || data.status === "none") {
        setTask(null);
        setIsRunning(false);
        stopPolling();
        return;
      }
      setTask(data);
      const running = data.status === "running";
      setIsRunning(running);
      if (!running) {
        stopPolling();
        if (data.status === "completed") onCompleteRef.current?.(data);
        if (data.status === "failed") onFailRef.current?.(data);
      }
    } catch {
      if (mountedRef.current) {
        setTask(null);
        setIsRunning(false);
        stopPolling();
      }
    }
  }, [dsId, taskType, stopPolling]);

  const refetch = useCallback(() => {
    fetchTask();
  }, [fetchTask]);

  useEffect(() => {
    mountedRef.current = true;
    if (!dsId) return;
    // Initial fetch
    fetchTask();
    // Start polling
    timerRef.current = setInterval(fetchTask, pollInterval);

    return () => {
      mountedRef.current = false;
      stopPolling();
    };
  }, [dsId, taskType, fetchTask, pollInterval, stopPolling]);

  return { task, isRunning, refetch };
}
