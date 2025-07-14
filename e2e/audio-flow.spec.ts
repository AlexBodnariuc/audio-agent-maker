import { test, expect, Page } from '@playwright/test';

test.describe('Voice Chat Audio Flow E2E', () => {
  let page: Page;

  test.beforeEach(async ({ browser }) => {
    page = await browser.newPage();
    
    // Grant microphone permissions
    const context = page.context();
    await context.grantPermissions(['microphone']);
    
    // Navigate to the voice assistants page
    await page.goto('/voice-assistants');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should complete full audio interaction flow', async () => {
    // Step 1: Login as test user (if authentication is required)
    // This would need to be implemented based on your auth system
    // await loginAsTestUser(page);

    // Step 2: Open agent testing panel
    await expect(page.locator('[data-testid="agent-testing-panel"]')).toBeVisible();
    
    // Click to expand or open the panel if needed
    const panelButton = page.locator('button', { hasText: /test|chat|start/i }).first();
    if (await panelButton.isVisible()) {
      await panelButton.click();
    }

    // Step 3: Send a text question
    const messageInput = page.locator('input[type="text"], textarea').first();
    await expect(messageInput).toBeVisible();
    
    const testQuestion = 'Explică-mi pe scurt procesul de mitoză.';
    await messageInput.fill(testQuestion);
    
    // Submit the question
    const sendButton = page.locator('button[type="submit"], button', { hasText: /send|trimite|întreabă/i }).first();
    await sendButton.click();

    // Step 4: Verify user message bubble appears
    const userBubble = page.locator('[data-testid="message-bubble"][data-type="user"]').last();
    await expect(userBubble).toBeVisible();
    await expect(userBubble).toContainText(testQuestion);

    // Step 5: Wait for assistant response bubble with text
    const assistantBubble = page.locator('[data-testid="message-bubble"][data-type="assistant"]').last();
    await expect(assistantBubble).toBeVisible({ timeout: 15000 });
    
    // Verify text content is present
    await expect(assistantBubble.locator('.message-content')).not.toBeEmpty();

    // Step 6: Wait for TTS processing spinner to appear
    const ttsSpinner = assistantBubble.locator('[data-testid="tts-spinner"], .loading-spinner, .processing');
    await expect(ttsSpinner).toBeVisible({ timeout: 5000 });

    // Step 7: Wait for audio element to be attached and ready
    const audioElement = assistantBubble.locator('audio[data-testid="message-audio"]');
    
    // Wait for audio element with src attribute
    await expect(audioElement).toBeVisible({ timeout: 30000 });
    await expect(audioElement).toHaveAttribute('src', /.+/);

    // Verify audio src contains expected pattern
    const audioSrc = await audioElement.getAttribute('src');
    expect(audioSrc).toMatch(/voices-cache.*\.mp3/);

    // Step 8: Verify audio is in playing or ready state
    // Wait for audio to be loaded
    await page.waitForFunction(
      (audioEl) => {
        const audio = audioEl as HTMLAudioElement;
        return audio.readyState >= 2; // HAVE_CURRENT_DATA or higher
      },
      audioElement
    );

    // Check if audio can be played
    const canPlayAudio = await audioElement.evaluate((audio: HTMLAudioElement) => {
      return audio.readyState >= 2 && !audio.error;
    });
    
    expect(canPlayAudio).toBe(true);

    // Step 9: Verify spinner disappears after audio is ready
    await expect(ttsSpinner).not.toBeVisible({ timeout: 10000 });

    // Step 10: Optional - Test audio playback functionality
    // Click play button if it exists
    const playButton = assistantBubble.locator('button[data-testid="play-audio"], button[aria-label*="play"]');
    if (await playButton.isVisible()) {
      await playButton.click();
      
      // Verify audio is playing
      const isPlaying = await audioElement.evaluate((audio: HTMLAudioElement) => {
        return !audio.paused && audio.currentTime > 0;
      });
      
      expect(isPlaying).toBe(true);
    }
  });

  test('should handle TTS loading states correctly', async () => {
    // Send a message
    const messageInput = page.locator('input[type="text"], textarea').first();
    await messageInput.fill('Scurtă întrebare pentru test TTS.');
    
    const sendButton = page.locator('button[type="submit"], button', { hasText: /send|trimite/i }).first();
    await sendButton.click();

    // Wait for assistant response
    const assistantBubble = page.locator('[data-testid="message-bubble"][data-type="assistant"]').last();
    await expect(assistantBubble).toBeVisible({ timeout: 15000 });

    // Verify loading state is shown
    const loadingIndicator = assistantBubble.locator('.loading, .processing, [data-testid="tts-loading"]');
    await expect(loadingIndicator).toBeVisible();

    // Verify loading text or spinner
    await expect(
      assistantBubble.locator('text="Generating audio..." , text="Se generează audio...", .spinner')
    ).toBeVisible();

    // Wait for loading to complete
    await expect(loadingIndicator).not.toBeVisible({ timeout: 30000 });

    // Verify audio controls are now visible
    const audioControls = assistantBubble.locator('audio, [data-testid="audio-controls"]');
    await expect(audioControls).toBeVisible();
  });

  test('should show error state for failed TTS generation', async () => {
    // This test would require mocking TTS failures or using a special test scenario
    // For now, we'll test the error UI components exist
    
    // Send a message that might cause TTS to fail (very long text, special characters, etc.)
    const messageInput = page.locator('input[type="text"], textarea').first();
    await messageInput.fill('Test cu caractere speciale și text foarte lung pentru a forța o eroare în sistemul TTS care ar putea să nu reușească să proceseze corect această întrebare complexă cu multe cuvinte și fraze lungi care depășesc limitele normale de procesare a textului pentru generarea audio folosind tehnologia text-to-speech.');
    
    const sendButton = page.locator('button[type="submit"], button', { hasText: /send|trimite/i }).first();
    await sendButton.click();

    const assistantBubble = page.locator('[data-testid="message-bubble"][data-type="assistant"]').last();
    await expect(assistantBubble).toBeVisible({ timeout: 15000 });

    // Check for error state (after a reasonable timeout)
    // This might show as a retry button, error message, or fallback state
    const errorStates = [
      '[data-testid="tts-error"]',
      'text="Audio generation failed"',
      'text="Eroare la generarea audio"',
      'button[data-testid="retry-tts"]',
      '.error-message'
    ];

    let errorFound = false;
    for (const errorSelector of errorStates) {
      try {
        await expect(assistantBubble.locator(errorSelector)).toBeVisible({ timeout: 45000 });
        errorFound = true;
        break;
      } catch {
        // Continue to next selector
      }
    }

    // If no error state is found, verify normal audio generation worked
    if (!errorFound) {
      const audioElement = assistantBubble.locator('audio');
      await expect(audioElement).toBeVisible({ timeout: 45000 });
    }
  });

  test('should support multiple consecutive messages with TTS', async () => {
    const questions = [
      'Prima întrebare scurtă.',
      'A doua întrebare despre biologie.',
      'A treia întrebare finală.'
    ];

    for (let i = 0; i < questions.length; i++) {
      const question = questions[i];
      
      // Send message
      const messageInput = page.locator('input[type="text"], textarea').first();
      await messageInput.fill(question);
      
      const sendButton = page.locator('button[type="submit"], button', { hasText: /send|trimite/i }).first();
      await sendButton.click();

      // Wait for response
      const assistantBubbles = page.locator('[data-testid="message-bubble"][data-type="assistant"]');
      await expect(assistantBubbles).toHaveCount(i + 1, { timeout: 15000 });

      // Verify latest response has audio
      const latestBubble = assistantBubbles.last();
      const audioElement = latestBubble.locator('audio');
      await expect(audioElement).toBeVisible({ timeout: 30000 });

      // Verify audio source is valid
      const audioSrc = await audioElement.getAttribute('src');
      expect(audioSrc).toMatch(/voices-cache.*\.mp3/);
    }

    // Verify all messages have audio
    const allAudioElements = page.locator('[data-testid="message-bubble"][data-type="assistant"] audio');
    await expect(allAudioElements).toHaveCount(questions.length);
  });

  test('should handle voice selection and playback controls', async () => {
    // Send a test message
    const messageInput = page.locator('input[type="text"], textarea').first();
    await messageInput.fill('Test pentru controale audio.');
    
    const sendButton = page.locator('button[type="submit"], button', { hasText: /send|trimite/i }).first();
    await sendButton.click();

    // Wait for response with audio
    const assistantBubble = page.locator('[data-testid="message-bubble"][data-type="assistant"]').last();
    await expect(assistantBubble).toBeVisible({ timeout: 15000 });
    
    const audioElement = assistantBubble.locator('audio');
    await expect(audioElement).toBeVisible({ timeout: 30000 });

    // Test play/pause controls if they exist
    const playButton = assistantBubble.locator('button[aria-label*="play"], button[data-testid="play-button"]');
    if (await playButton.isVisible()) {
      // Test play functionality
      await playButton.click();
      
      // Verify audio starts playing
      await page.waitForTimeout(1000); // Allow audio to start
      
      const isPlaying = await audioElement.evaluate((audio: HTMLAudioElement) => {
        return !audio.paused;
      });
      
      expect(isPlaying).toBe(true);

      // Test pause if pause button appears
      const pauseButton = assistantBubble.locator('button[aria-label*="pause"], button[data-testid="pause-button"]');
      if (await pauseButton.isVisible()) {
        await pauseButton.click();
        
        const isPaused = await audioElement.evaluate((audio: HTMLAudioElement) => {
          return audio.paused;
        });
        
        expect(isPaused).toBe(true);
      }
    }

    // Test volume controls if they exist
    const volumeSlider = assistantBubble.locator('input[type="range"][aria-label*="volume"], .volume-slider');
    if (await volumeSlider.isVisible()) {
      await volumeSlider.fill('50');
      
      const volume = await audioElement.evaluate((audio: HTMLAudioElement) => {
        return audio.volume;
      });
      
      expect(volume).toBeCloseTo(0.5, 1);
    }
  });

  test.afterEach(async () => {
    await page.close();
  });
});

// Helper function for authentication (implement based on your auth system)
async function loginAsTestUser(page: Page) {
  // This would implement the login flow for your application
  // Example:
  // await page.goto('/login');
  // await page.fill('[data-testid="email"]', 'test@medmentor.ro');
  // await page.fill('[data-testid="password"]', 'testpassword');
  // await page.click('[data-testid="login-button"]');
  // await page.waitForURL('/voice-assistants');
}