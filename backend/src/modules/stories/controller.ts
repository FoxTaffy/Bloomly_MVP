import { FastifyReply, FastifyRequest } from 'fastify';
import { storiesService } from './service.js';

interface JwtUser { id: string; role: string }

export const getStoriesHandler = async (
  _request: FastifyRequest,
  reply: FastifyReply,
) => {
  try {
    const stories = await storiesService.getActiveStories();
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
  request: FastifyRequest<{ Body: { image_url?: string } }>,
  reply: FastifyReply,
) => {
  try {
    const { id: userId } = request.user as JwtUser;
    const { image_url } = request.body;
    const story = await storiesService.createStory(userId, image_url);
    return reply.code(201).send({ success: true, data: { story }, error: null });
  } catch (error: unknown) {
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
    const stories = await storiesService.getStoriesByUser(request.params.userId);
    return reply.send({ success: true, data: { stories }, error: null });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to fetch user stories';
    return reply.code(500).send({
      success: false,
      data: null,
      error: { code: 'GET_USER_STORIES_ERROR', message },
    });
  }
};
