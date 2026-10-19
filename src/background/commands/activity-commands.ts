import { register } from '../message-router';
import { Message } from '../../messaging/messages';
import type { ActivityListRequest, ActivityRecordRequest } from '../../messaging/messages';
import { ActivityRepository } from '../../data/activity-repository';
import { listActivities, recordUserActivity } from '../../services/activity-service';
import { unwrap } from '../../shared/utils/result';

export function registerActivityCommands(): void {
  const repo = new ActivityRepository();
  register(Message.ACTIVITY_RECORD, async (payload) => {
    const request = payload as ActivityRecordRequest;
    return unwrap(await recordUserActivity(repo, request));
  });
  register(Message.ACTIVITY_LIST, async (payload) => {
    const request = (payload ?? {}) as ActivityListRequest;
    return unwrap(await listActivities(repo, request));
  });
}
