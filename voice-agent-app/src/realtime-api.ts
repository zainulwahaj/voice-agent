/**
 * OpenAI Realtime API Client
 * Direct WebSocket connection without SDK dependencies
 */

export interface RealtimeConfig {
  apiKey: string
  model?: string
  voice?: 'alloy' | 'echo' | 'shimmer'
  instructions?: string
  tools?: any[]
}

export interface RealtimeEvent {
  type: string
  event_id?: string
  [key: string]: any
}

export class RealtimeAPIClient {
  private ws: WebSocket | null = null
  private eventHandlers: Map<string, Function[]> = new Map()
  private audioContext: AudioContext | null = null
  private audioQueue: AudioBuffer[] = []
  private isPlaying = false
  private mediaStream: MediaStream | null = null
  private config: RealtimeConfig

  constructor(config: RealtimeConfig) {
    this.config = config
  }

  /**
   * Connect to OpenAI Realtime API via WebSocket
   */
  async connect(): Promise<void> {
    const url = `wss://api.openai.com/v1/realtime?model=${this.config.model || 'gpt-4o-realtime-preview-2024-10-01'}`
    
    console.log('🔌 Connecting to:', url)
    console.log('🔑 Using API key:', this.config.apiKey ? `${this.config.apiKey.substring(0, 20)}...` : 'MISSING!')
    
    this.ws = new WebSocket(url, [
      'realtime',
      `openai-insecure-api-key.${this.config.apiKey}`,
      'openai-beta.realtime-v1'
    ])

    this.ws.addEventListener('open', this.handleOpen.bind(this))
    this.ws.addEventListener('message', this.handleMessage.bind(this))
    this.ws.addEventListener('error', this.handleError.bind(this))
    this.ws.addEventListener('close', this.handleClose.bind(this))

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        console.error('❌ WebSocket connection timeout after 10 seconds')
        console.error('   Make sure:')
        console.error('   1. VITE_OPENAI_API_KEY is set in .env')
        console.error('   2. API key has Realtime API access')
        console.error('   3. No firewall blocking WebSocket')
        reject(new Error('Connection timeout'))
      }, 10000)
      
      this.ws!.addEventListener('open', () => {
        clearTimeout(timeout)
        resolve()
      }, { once: true })
      
      this.ws!.addEventListener('error', (err) => {
        clearTimeout(timeout)
        console.error('❌ WebSocket error event:', err)
        reject(new Error(`WebSocket error: ${err.type}`))
      }, { once: true })
    })
  }

  /**
   * Handle WebSocket open event
   */
  private handleOpen() {
    console.log('🔌 Connected to OpenAI Realtime API')
    
    // Configure the session
    this.send({
      type: 'session.update',
      session: {
        modalities: ['text', 'audio'],
        instructions: this.config.instructions || 'You are a helpful assistant.',
        voice: this.config.voice || 'alloy',
        input_audio_format: 'pcm16',
        output_audio_format: 'pcm16',
        input_audio_transcription: {
          model: 'whisper-1'
        },
        turn_detection: {
          type: 'server_vad',
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500
        },
        tools: this.config.tools || [],
        tool_choice: 'auto'
      }
    })

    this.emit('connected', {})
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(event: MessageEvent) {
    try {
      const data: RealtimeEvent = JSON.parse(event.data)
      console.log('📨 Received:', data.type)
      
      // Emit specific event
      this.emit(data.type, data)
      
      // Handle audio responses
      if (data.type === 'response.audio.delta') {
        this.handleAudioDelta(data.delta)
      }
      
      if (data.type === 'response.audio.done') {
        this.handleAudioDone()
      }
    } catch (error) {
      console.error('Failed to parse message:', error)
    }
  }

  /**
   * Handle WebSocket errors
   */
  private handleError(error: Event) {
    console.error('❌ WebSocket error:', error)
    this.emit('error', { error })
  }

  /**
   * Handle WebSocket close
   */
  private handleClose(event: CloseEvent) {
    console.log('🔌 Disconnected from OpenAI Realtime API')
    console.log('   Code:', event.code)
    console.log('   Reason:', event.reason || 'No reason provided')
    console.log('   Clean:', event.wasClean)
    
    if (event.code === 1008) {
      console.error('❌ Policy violation - likely invalid API key')
    } else if (event.code === 1002) {
      console.error('❌ Protocol error')
    } else if (event.code === 1006) {
      console.error('❌ Abnormal closure - connection failed')
    }
    
    this.emit('disconnected', { code: event.code, reason: event.reason })
  }

  /**
   * Send event to OpenAI
   */
  send(event: RealtimeEvent) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.error('WebSocket not connected')
      return
    }
    
    console.log('📤 Sending:', event.type)
    this.ws.send(JSON.stringify(event))
  }

  /**
   * Register event handler
   */
  on(eventType: string, handler: Function) {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, [])
    }
    this.eventHandlers.get(eventType)!.push(handler)
  }

  /**
   * Emit event to handlers
   */
  private emit(eventType: string, data: any) {
    const handlers = this.eventHandlers.get(eventType) || []
    handlers.forEach(handler => handler(data))
  }

  /**
   * Start capturing microphone audio
   */
  async startAudioCapture() {
    try {
      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 24000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true
        } 
      })

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 24000 })
      const source = this.audioContext.createMediaStreamSource(this.mediaStream)

      // Create ScriptProcessor for capturing audio
      const processor = this.audioContext.createScriptProcessor(2048, 1, 1)
      
      processor.onaudioprocess = (e) => {
        const inputData = e.inputBuffer.getChannelData(0)
        const pcm16 = this.float32ToPCM16(inputData)
        const base64 = this.arrayBufferToBase64(pcm16)
        
        // Send audio to OpenAI
        this.send({
          type: 'input_audio_buffer.append',
          audio: base64
        })
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)

      console.log('🎤 Microphone capture started')
      this.emit('audio_capture_started', {})
    } catch (error) {
      console.error('❌ Failed to start audio capture:', error)
      throw error
    }
  }

  /**
   * Handle audio delta from assistant
   */
  private handleAudioDelta(base64Audio: string) {
    if (!this.audioContext) {
      this.audioContext = new AudioContext({ sampleRate: 24000 })
    }

    // Decode base64 to PCM16
    const pcm16 = this.base64ToArrayBuffer(base64Audio)
    const float32 = this.pcm16ToFloat32(new Int16Array(pcm16))

    // Create audio buffer
    const audioBuffer = this.audioContext.createBuffer(1, float32.length, 24000)
    audioBuffer.getChannelData(0).set(float32)

    // Add to queue
    this.audioQueue.push(audioBuffer)

    // Start playback if not already playing
    if (!this.isPlaying) {
      this.playNextAudio()
    }
  }

  /**
   * Handle audio done
   */
  private handleAudioDone() {
    console.log('🔊 Audio response complete')
  }

  /**
   * Play next audio buffer from queue
   */
  private playNextAudio() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false
      return
    }

    this.isPlaying = true
    const audioBuffer = this.audioQueue.shift()!

    const source = this.audioContext!.createBufferSource()
    source.buffer = audioBuffer
    source.connect(this.audioContext!.destination)
    
    source.onended = () => {
      this.playNextAudio()
    }

    source.start()
  }

  /**
   * Convert Float32Array to PCM16
   */
  private float32ToPCM16(float32: Float32Array): ArrayBuffer {
    const pcm16 = new Int16Array(float32.length)
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]))
      pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return pcm16.buffer
  }

  /**
   * Convert PCM16 to Float32Array
   */
  private pcm16ToFloat32(pcm16: Int16Array): Float32Array {
    const float32 = new Float32Array(pcm16.length)
    for (let i = 0; i < pcm16.length; i++) {
      float32[i] = pcm16[i] / (pcm16[i] < 0 ? 0x8000 : 0x7FFF)
    }
    return float32
  }

  /**
   * Convert ArrayBuffer to base64
   */
  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (const byte of bytes) {
      binary += String.fromCharCode(byte)
    }
    return btoa(binary)
  }

  /**
   * Convert base64 to ArrayBuffer
   */
  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i)
    }
    return bytes.buffer
  }

  /**
   * Disconnect from OpenAI
   */
  disconnect() {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop())
      this.mediaStream = null
    }

    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }

    console.log('🔌 Disconnected')
  }
}
