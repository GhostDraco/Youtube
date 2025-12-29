// Educational/Testing YouTube Downloader API
// STRICTLY FOR PRIVATE TESTING PURPOSES ONLY

const fs = require('fs');
const path = require('path');
const ytdl = require('ytdl-core');

module.exports = async function handler(req, res) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed. Use GET.' });
  }

  // Disable body parsing for proper streaming
  req.on('data', () => {});
  req.on('end', () => {});

  try {
    const { url } = req.query;

    // 1. Validate required parameters
    if (!url) {
      return res.status(400).json({ 
        error: 'Missing required parameter: url',
        usage: '/api/download?url=YOUTUBE_URL'
      });
    }

    // 2. Validate YouTube URL format
    if (!ytdl.validateURL(url)) {
      return res.status(400).json({ 
        error: 'Invalid YouTube URL format',
        example: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
      });
    }

    // 3. Load cookies from file (for private testing only)
    const cookiesPath = path.join(process.cwd(), 'cookies.txt');
    let cookieHeader = '';
    
    // Check if cookies file exists
    if (!fs.existsSync(cookiesPath)) {
      console.warn('Cookies file not found. Proceeding without authentication cookies.');
    } else {
      try {
        // Read cookies file
        const cookiesContent = fs.readFileSync(cookiesPath, 'utf8');
        
        // Parse cookies.txt format (Netscape format)
        const cookieLines = cookiesContent.split('\n');
        const cookies = [];
        
        for (const line of cookieLines) {
          const trimmedLine = line.trim();
          
          // Skip comments and empty lines
          if (!trimmedLine || trimmedLine.startsWith('#') || trimmedLine.startsWith('//')) {
            continue;
          }
          
          const parts = trimmedLine.split('\t');
          if (parts.length >= 7) {
            const cookieName = parts[5];
            const cookieValue = parts[6];
            if (cookieName && cookieValue) {
              cookies.push(`${cookieName}=${cookieValue}`);
            }
          }
        }
        
        // Combine all cookies into single header string
        if (cookies.length > 0) {
          cookieHeader = cookies.join('; ');
          console.log(`Loaded ${cookies.length} cookies from file`);
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
        'Cookie': cookieHeader,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      };
    }

    // 5. Get video info first (for validation and filename)
    console.log(`Processing video: ${url}`);
    const info = await ytdl.getInfo(url, { requestOptions });
    
    // 6. Find available formats
    const formats = ytdl.filterFormats(info.formats, 'videoandaudio');
    
    if (formats.length === 0) {
      // Fallback to any format with video
      const videoFormats = info.formats.filter(format => format.hasVideo);
      if (videoFormats.length === 0) {
        return res.status(400).json({ 
          error: 'No downloadable format available for this video' 
        });
      }
      
      // Use the first available video format
      var selectedFormat = videoFormats[0];
    } else {
      // Use ytdl-core's built-in quality selector for lowest
      var selectedFormat = formats[0];
    }

    // 7. Set response headers for download
    const safeFilename = info.videoDetails.title
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 100) || 'video';
    
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}.mp4"`);
    
    // Optional: Set content length if available
    if (selectedFormat.contentLength) {
      res.setHeader('Content-Length', selectedFormat.contentLength);
    }

    // 8. Stream video directly to response
    console.log(`Starting download: ${info.videoDetails.title}`);
    console.log(`Selected quality: ${selectedFormat.qualityLabel || selectedFormat.quality}`);
    
    const videoStream = ytdl(url, {
      format: selectedFormat,
      requestOptions,
      quality: 'lowest',
    });

    // Handle stream errors
    videoStream.on('error', (streamError) => {
      console.error('Stream error:', streamError.message);
      if (!res.headersSent) {
        res.status(500).json({ error: 'Stream failed', details: streamError.message });
      }
    });

    // Pipe video stream to response
    videoStream.pipe(res);

    // Handle successful completion
    videoStream.on('end', () => {
      console.log('Download completed successfully');
    });

    // Handle client disconnect
    req.on('close', () => {
      console.log('Client disconnected');
      videoStream.destroy();
    });

  } catch (error) {
    console.error('Download error:', error.message);
    
    // Provide appropriate error responses
    if (error.message.includes('private') || error.message.includes('unavailable')) {
      return res.status(403).json({ 
        error: 'Video is private or unavailable',
        note: 'If testing private videos, ensure cookies.txt contains valid authentication cookies'
      });
    }
    
    if (error.message.includes('cookies') || error.message.includes('authentication')) {
      return res.status(403).json({ 
        error: 'Authentication required',
        note: 'Check cookies.txt file for valid YouTube session cookies'
      });
    }
    
    if (error.message.includes('format')) {
      return res.status(400).json({ 
        error: 'No supported format available',
        details: error.message 
      });
    }
    
    res.status(500).json({ 
      error: 'Failed to process download request',
      details: error.message.substring(0, 100) // Limit error details length
    });
  }
};
