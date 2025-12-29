// Educational/Testing YouTube Downloader API
// STRICTLY FOR PRIVATE TESTING PURPOSES ONLY

import fs from 'fs';
import path from 'path';
import ytdl from 'ytdl-core';

// Disable Vercel body parsing for proper streaming
export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  try {
    const { url } = req.query;

    // 1. Validate required parameters
    if (!url) {
      return res.status(400).json({ 
        error: 'Missing required parameter: url' 
      });
    }

    // 2. Validate YouTube URL format
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ 
        error: 'Invalid YouTube URL format' 
      });
    }

    // 3. Load cookies from file (for private testing only)
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    
    // Check if cookies file exists
    if (!fs.existsSync(cookiesPath)) {
      console.warn('Cookies file not found. Proceeding without authentication cookies.');
    }

    let cookieHeader = '';
    
    if (fs.existsSync(cookiesPath)) {
      try {
        // Read cookies file
        const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
        
        // Parse cookies.txt format (Netscape format)
        // Each line: domain \t flag \t path \t secure \t expiration \t name \t value
        const cookieLines = cookiesContent.split('\n');
        
        // Extract cookie name-value pairs, skipping comments and empty lines
        const cookies = cookieLines
          .filter(line => line.trim() && !line.startsWith('#') && !line.startsWith('//'))
          .map(line => {
            const parts = line.split('\t');
            if (parts.length >= 7) {
              return `${parts[5]}=${parts[6]}`;
            }
            return null;
          })
          .filter(cookie => cookie !== null);
        
        // Combine all cookies into single header string
        if (cookies.length > 0) {
          cookieHeader = cookies.join('; ');
        }
      } catch (cookieError) {
        console.error('Error reading cookies file:', cookieError.message);
        // Continue without cookies if file is malformed
      }
    }

    // 4. Prepare request options with cookies if available
    const requestOptions = {};
    
    if (cookieHeader) {
      requestOptions.headers = {
        'Cookie': cookieHeader
      };
    }

    // 5. Get video info first (for validation)
    const info = await ytdl.getInfo(url, { requestOptions });
    
    // 6. Find lowest quality MP4 format for testing
    // Filter for MP4 formats with video and audio
    const formats = info.formats.filter(format => 
      format.container === 'mp4' && 
      format.hasVideo && 
      format.hasAudio
    );
    
    if (formats.length === 0) {
      return res.status(400).json({ 
        error: 'No MP4 format available for this video' 
      });
    }
    
    // Sort by quality (lowest first) for testing
    const sortedFormats = formats.sort((a, b) => {
      const getHeight = (format) => format.height || 0;
      return getHeight(a) - getHeight(b);
    });
    
    // Select the lowest quality MP4
    const selectedFormat = sortedFormats[0];

    // 7. Set response headers for download
    const safeFilename = info.videoDetails.title
      .replace(/[^a-z0-9]/gi, '_')
      .substring(0, 50) || 'video';
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
    res.setHeader('Content-Length', selectedFormat.contentLength || 'unknown');

    // 8. Stream video directly to response
    const videoStream = ytdl(url, {
      format: selectedFormat,
      requestOptions,
      // Quality selection for educational/testing purposes
      quality: 'lowest',
    });

    // Handle stream events
    videoStream.on('error', (streamError) => {
      console.error('Stream error:', streamError.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed' });
      }
    });

    // Pipe video stream to response
    videoStream.pipe(res);

    // Handle client disconnect
    req.on('close', () => {
      videoStream.destroy();
    });

  } catch (error) {
    console.error('Download error:', error.message);
    
    // Provide appropriate error responses
    if (error.message.includes('private') || error.message.includes('unavailable')) {
      return res.status(403).json({ 
        error: 'Video unavailable. This might require authentication.' 
      });
    }
    
    if (error.message.includes('cookies')) {
      return res.status(403).json({ 
        error: 'Authentication required. Check cookies.txt file.' 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to process download request',
      details: error.message 
    });
  }
}
