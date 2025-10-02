/**
 * OpenAI Realtime API Client (WebSocket-based)
 * Based on official documentation: https://platform.openai.com/docs/guides/realtime
 */

export interface RealtimeClientConfig {
  apiKey: string
  onConnect?: () => void
  onDisconnect?: () => void
  onError?: (error: any) => void
  onTranscript?: (text: string, role: 'user' | 'assistant') => void
  onAudioData?: (audio: Int16Array) => void
  onFunctionCall?: (name: string, args: any, callId: string) => void
}

export interface Tool {
  name: string
  description: string
  parameters: any
}

export class RealtimeClient {
  private ws: WebSocket | null = null
  private audioContext: AudioContext | null = null
  private audioWorklet: AudioWorkletNode | null = null
  private audioStream: MediaStream | null = null
  private config: RealtimeClientConfig
  private isConnected = false

  constructor(config: RealtimeClientConfig) {
    this.config = config
  }

  async connect(tools: Tool[] = []) {
    try {
      // Create WebSocket connection
      const url = 'wss://api.openai.com/v1/realtime?model=gpt-4o-realtime-preview-2024-10-01'
      
      this.ws = new WebSocket(url, [
        'realtime',
        `openai-insecure-api-key.${this.config.apiKey}`,
        'openai-beta.realtime-v1'
      ])

      this.ws.addEventListener('open', async () => {
        console.log('✅ WebSocket connected')
        this.isConnected = true

        // Send session.update with tools
        this.send({
          type: 'session.update',
          session: {
            modalities: ['text', 'audio'],
            instructions: `You are a helpful calendar assistant. When users ask about their calendar, use the provided tools to help them. Current time: ${new Date().toISOString()}`,
            voice: 'alloy',
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
            tools: tools.map(t => ({
              type: 'function',
              name: t.name,
              description: t.description,
              parameters: t.parameters
            }))
          }
        })

        console.log('📤 Session configured with', tools.length, 'tools')

        // Set up audio capture
        await this.setupAudio()

        this.config.onConnect?.()
      })

      this.ws.addEventListener('message', (event) => {
        this.handleServerEvent(JSON.parse(event.data))
      })

      this.ws.addEventListener('error', (error) => {
        console.error('❌ WebSocket error:', error)
        this.config.onError?.(error)
      })

      this.ws.addEventListener('close', () => {
        console.log('WebSocket closed')
        this.isConnected = false
        this.cleanup()
        this.config.onDisconnect?.()
      })

    } catch (error) {
      console.error('❌ Connection failed:', error)
      this.config.onError?.(error)
      throw error
    }
  }

  private async setupAudio() {
    try {
      // Get microphone access
      this.audioStream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          channelCount: 1,
          sampleRate: 24000,
          echoCancellation: true,
          noiseSuppression: true
        }
      })

      // Create audio context
      this.audioContext = new AudioContext({ sampleRate: 24000 })
      const source = this.audioContext.createMediaStreamSource(this.audioStream)

      // Create processor for sending audio
      const processor = this.audioContext.createScriptProcessor(4096, 1, 1)
      
      processor.onaudioprocess = (e) => {
        if (!this.isConnected) return

        const inputData = e.inputBuffer.getChannelData(0)
        const pcm16 = this.floatTo16BitPCM(inputData)
        
        // Send audio to server
        this.send({
          type: 'input_audio_buffer.append',
          audio: this.arrayBufferToBase64(pcm16.buffer)
        })
      }

      source.connect(processor)
      processor.connect(this.audioContext.destination)

      console.log('🎤 Audio capture started')
    } catch (error) {
      console.error('❌ Audio setup failed:', error)
      throw error
    }
  }

  private handleServerEvent(event: any) {
    console.log('📥', event.type)

    switch (event.type) {
      case 'session.created':
        console.log('Session created:', event.session)
        break

      case 'session.updated':
        console.log('Session updated')
        break

      case 'conversation.item.input_audio_transcription.completed':
        console.log('🎤 User:', event.transcript)
        this.config.onTranscript?.(event.transcript, 'user')
        break

      case 'response.audio_transcript.delta':
        // Accumulate assistant speech
        break

      case 'response.audio_transcript.done':
        console.log('🤖 Assistant:', event.transcript)
        this.config.onTranscript?.(event.transcript, 'assistant')
        break

      case 'response.audio.delta':
        // Handle audio playback
        const audioData = this.base64ToArrayBuffer(event.delta)
        const pcm16 = new Int16Array(audioData)
        this.config.onAudioData?.(pcm16)
        break

      case 'response.function_call_arguments.done':
        console.log('🔧 Tool call:', event.name)
        this.config.onFunctionCall?.(event.name, event.arguments, event.call_id)
        break

      case 'error':
        console.error('❌ Server error:', event.error)
        this.config.onError?.(event.error)
        break
    }
  }

  // Submit function call result back to the API
  submitToolResult(callId: string, output: string) {
    if (!this.isConnected) return

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'function_call_output',
        call_id: callId,
        output: output
      }
    })

    // Trigger response generation
    this.send({
      type: 'response.create'
    })
  }

  // Send a text message
  sendText(text: string) {
    if (!this.isConnected) return

    this.send({
      type: 'conversation.item.create',
      item: {
        type: 'message',
        role: 'user',
        content: [{
          type: 'input_text',
          text: text
        }]
      }
    })

    this.send({ type: 'response.create' })
  }

  private send(event: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(event))
    }
  }

  disconnect() {
    this.cleanup()
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }
  }

  private cleanup() {
    if (this.audioStream) {
      this.audioStream.getTracks().forEach(track => track.stop())
      this.audioStream = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
  }

  // Utility functions for audio conversion
  private floatTo16BitPCM(float32Array: Float32Array): Int16Array {
    const int16Array = new Int16Array(float32Array.length)
    for (let i = 0; i < float32Array.length; i++) {
      const s = Math.max(-1, Math.min(1, float32Array[i]))
      int16Array[i] = s < 0 ? s * 0x8000 : s * 0x7FFF
    }
    return int16Array
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i])
    }
    return btoa(binary)
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64)
    const bytes = new Uint8Array(binaryString.length)
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }
    return bytes.buffer
  }
}
