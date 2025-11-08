from googleapiclient.discovery import build
from googleapiclient.errors import HttpError
from datetime import datetime
import logging

logger = logging.getLogger(__name__)


class YouTubeService:
    def __init__(self, api_key):
        self.api_key = api_key
        self.youtube = build('youtube', 'v3', developerKey=api_key)
    
    def extract_video_id(self, url_or_id):
        """Extract video ID from various YouTube URL formats or return ID if already extracted."""
        if 'youtube.com/watch?v=' in url_or_id:
            return url_or_id.split('watch?v=')[1].split('&')[0]
        elif 'youtu.be/' in url_or_id:
            return url_or_id.split('youtu.be/')[1].split('?')[0]
        else:
            # Assume it's already a video ID
            return url_or_id
    
    def get_video_details(self, video_id):
        """Fetch video details from YouTube API."""
        try:
            request = self.youtube.videos().list(
                part='snippet,statistics',
                id=video_id
            )
            response = request.execute()
            
            if not response.get('items'):
                return None
            
            item = response['items'][0]
            snippet = item['snippet']
            statistics = item['statistics']
            
            return {
                'video_id': video_id,
                'title': snippet.get('title', ''),
                'channel_title': snippet.get('channelTitle', ''),
                'description': snippet.get('description', ''),
                'published_at': datetime.fromisoformat(snippet['publishedAt'].replace('Z', '+00:00')),
                'thumbnail_url': snippet.get('thumbnails', {}).get('high', {}).get('url', ''),
                'view_count': int(statistics.get('viewCount', 0)),
                'like_count': int(statistics.get('likeCount', 0)),
                'comment_count': int(statistics.get('commentCount', 0))
            }
        except HttpError as e:
            logger.error(f"YouTube API error getting video details: {e}")
            return None
        except Exception as e:
            logger.error(f"Error getting video details: {e}")
            return None
    
    def get_video_comments(self, video_id, max_results=100):
        """Fetch all comments (including replies) for a video."""
        comments = []
        
        try:
            # Get top-level comments
            next_page_token = None
            while True:
                request = self.youtube.commentThreads().list(
                    part='snippet,replies',
                    videoId=video_id,
                    maxResults=min(max_results, 100),
                    pageToken=next_page_token,
                    textFormat='plainText'
                )
                response = request.execute()
                
                for item in response.get('items', []):
                    # Top-level comment
                    top_comment = item['snippet']['topLevelComment']['snippet']
                    comments.append({
                        'comment_id': item['snippet']['topLevelComment']['id'],
                        'parent_id': None,
                        'author': top_comment.get('authorDisplayName', ''),
                        'author_channel_id': top_comment.get('authorChannelId', {}).get('value', ''),
                        'text': top_comment.get('textDisplay', ''),
                        'like_count': top_comment.get('likeCount', 0),
                        'published_at': datetime.fromisoformat(top_comment['publishedAt'].replace('Z', '+00:00')),
                        'updated_at': datetime.fromisoformat(top_comment['updatedAt'].replace('Z', '+00:00'))
                    })
                    
                    # Replies
                    if 'replies' in item:
                        for reply in item['replies']['comments']:
                            reply_snippet = reply['snippet']
                            comments.append({
                                'comment_id': reply['id'],
                                'parent_id': item['snippet']['topLevelComment']['id'],
                                'author': reply_snippet.get('authorDisplayName', ''),
                                'author_channel_id': reply_snippet.get('authorChannelId', {}).get('value', ''),
                                'text': reply_snippet.get('textDisplay', ''),
                                'like_count': reply_snippet.get('likeCount', 0),
                                'published_at': datetime.fromisoformat(reply_snippet['publishedAt'].replace('Z', '+00:00')),
                                'updated_at': datetime.fromisoformat(reply_snippet['updatedAt'].replace('Z', '+00:00'))
                            })
                
                next_page_token = response.get('nextPageToken')
                if not next_page_token or len(comments) >= max_results:
                    break
            
            return comments
        
        except HttpError as e:
            if e.resp.status == 403:
                logger.warning(f"Comments are disabled for video {video_id}")
            else:
                logger.error(f"YouTube API error getting comments: {e}")
            return []
        except Exception as e:
            logger.error(f"Error getting comments: {e}")
            return []
