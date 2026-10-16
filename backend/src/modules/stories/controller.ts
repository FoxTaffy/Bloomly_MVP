import { FastifyReply, FastifyRequest } from 'fastify';
import { storiesService } from './service.js';
import { moderateStory } from '../automod/service.js';
import { logError } from '../../lib/logger.js';

interface JwtUser { id: string; role: string }

export const getStoriesHandler = async (
  request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const stories = await storiesService.getActiveStories(viewerId);
    return reply.send({ success: true, data: { stories }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch stories';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'GET_STORIES_ERROR', message },
    });
  }
};

export const createStoryHandler = async (
  request: FastifyRequest<{ Body: { image_url?: string; video_url?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { image_url, video_url } = request.body;
    const story = await storiesService.createStory(userId, image_url, video_url);

    // fire-and-forget automod check (does not block the response)
    moderateStory(story.id, userId).catch(logError('[AUTOMOD] moderateStory error'));

    return reply.code(201).send({ success: true, data: { story }, error: null });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'STORY_LIMIT_EXCEEDED') {
      return reply.code(429).send({
        success: false,
        data: null,
        error: { code: 'STORY_LIMIT_EXCEEDED', message: 'Too many active stories' },
      });
    }
    if (error instanceof Error && error.message === 'MISSING_MEDIA') {
      return reply.code(400).send({
        success: false,
        data: null,
        error: { code: 'MISSING_MEDIA', message: 'Story requires an image_url or video_url' },
      });
    }
    if (error instanceof Error && error.message === 'INVALID_MEDIA_URL') {
      return reply.code(422).send({
        success: false,
        data: null,
        error: { code: 'INVALID_MEDIA_URL', message: 'Media URL was not produced by an upload' },
      });
    }
    const message = error instanceof Error ? error.message : 'Failed to create story';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'CREATE_STORY_ERROR', message },
    });
  }
};

export const deleteStoryHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { id: storyId } = request.params;
    const result = await storiesService.deleteStory(storyId, userId);
    if (result === null) {
      return reply.code(404).send({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Story not found' },
      });
    }
    if (result === false) {
      return reply.code(403).send({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Not your story' },
      });
    }
    return reply.send({ success: true, data: null, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to delete story';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'DELETE_STORY_ERROR', message },
    });
  }
};

export const getUserStoriesHandler = async (
  request: FastifyRequest<{ Params: { userId: string } }>,
  reply: FastifyReply,
) => {
  try {
    const viewerId = (request.user as JwtUser | undefined)?.id;
    const stories = await storiesService.getStoriesByUser(request.params.userId, viewerId);
    return reply.send({ success: true, data: { stories }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user stories';
    const statusCode = (error as any)?.statusCode ?? 500;
    return reply.code(statusCode).send({
      success: false,
      data: null,
      error: { code: 'GET_USER_STORIES_ERROR', message },
    });
  }
};

export const viewStoryHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    await storiesService.recordView(request.params.id, userId);
    return reply.send({ success: true, data: null, error: null });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return reply.code(404).send({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Story not found' },
      });
    }
    const message = error instanceof Error ? error.message : 'Failed to record view';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'VIEW_STORY_ERROR', message },
    });
  }
};

export const getStoryViewersHandler = async (
  request: FastifyRequest<{ Params: { id: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const viewers = await storiesService.getViewers(request.params.id, userId);
    if (viewers === null) {
      return reply.code(404).send({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Story not found' },
      });
    }
    if (viewers === false) {
      return reply.code(403).send({
        success: false,
        data: null,
        error: { code: 'FORBIDDEN', message: 'Not your story' },
      });
    }
    return reply.send({ success: true, data: { viewers }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch viewers';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'GET_VIEWERS_ERROR', message },
    });
  }
};

export const voteStoryHandler = async (
  request: FastifyRequest<{ Params: { id: string }; Body: { value: 1 | -1 } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { value } = request.body;
    const result = await storiesService.voteStory(request.params.id, userId, value);
    return reply.send({ success: true, data: result, error: null });
  } catch (error: unknown) {
    if (error instanceof Error && error.message === 'NOT_FOUND') {
      return reply.code(404).send({
        success: false,
        data: null,
        error: { code: 'NOT_FOUND', message: 'Story not found' },
      });
    }
    const message = error instanceof Error ? error.message : 'Failed to vote';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'VOTE_STORY_ERROR', message },
    });
  }
};
