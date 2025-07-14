import { test, expect } from '@playwright/test';

test.describe('Speech2Speech Flow', () => {
  test.beforeEach(async ({ page, context }) => {
    // Grant microphone permissions
    await context.grantPermissions(['microphone']);
    
    // Navigate to voice assistants page
    await page.goto('/voice-assistants');
    
    // Wait for page to load
    await page.waitForLoadState('networkidle');
  });

  test('should display speech2speech interface', async ({ page }) => {
    // Look for speech2speech interface elements
    await expect(page.locator('text=Chat Vocal')).toBeVisible();
    await expect(page.locator('button:has-text("Ține apăsat pentru a vorbi")')).toBeVisible();
  });

  test('should show recording state when button is pressed', async ({ page }) => {
    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Start recording (mouse down)
    await recordButton.hover();
    await page.mouse.down();
    
    // Should show recording state
    await expect(page.locator('text=Vorbește acum')).toBeVisible();
    await expect(page.locator('.bg-destructive.rounded-full.animate-pulse')).toBeVisible();
    
    // Stop recording (mouse up)
    await page.mouse.up();
    
    // Should show processing state
    await expect(page.locator('text=Se procesează')).toBeVisible();
  });

  test('should handle microphone permission denied', async ({ page, context }) => {
    // Deny microphone permissions
    await context.clearPermissions();
    
    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Try to start recording
    await recordButton.click();
    
    // Should show error about microphone access
    await expect(page.locator('text*=microfonul')).toBeVisible();
  });

  test('should show error for invalid conversation', async ({ page }) => {
    // Mock a failing API response
    await page.route('**/functions/v1/speech2speech-chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: false,
          error: 'Conversation not found'
        })
      });
    });

    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Try to record
    await recordButton.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000); // Record for 1 second
    await page.mouse.up();
    
    // Should show error
    await expect(page.locator('text*=Conversation not found')).toBeVisible();
  });

  test('should reset state when reset button is clicked', async ({ page }) => {
    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    const resetButton = page.locator('button:has-text("Reset")');
    
    // Start and stop recording to change state
    await recordButton.hover();
    await page.mouse.down();
    await page.waitForTimeout(500);
    await page.mouse.up();
    
    // Click reset
    await resetButton.click();
    
    // Should return to initial state
    await expect(page.locator('text=Ține apăsat butonul pentru a începe')).toBeVisible();
  });

  test('should show transcriptions when enabled', async ({ page }) => {
    // Mock successful API response
    await page.route('**/functions/v1/speech2speech-chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          transcription: 'Test transcription',
          aiResponse: 'Test AI response',
          audioContent: 'mockAudioData',
          metadata: {
            conversationId: 'test-id',
            voice: 'alloy',
            language: 'ro'
          }
        })
      });
    });

    // Enable transcription display (if there's a toggle)
    const showTranscriptionsToggle = page.locator('[data-testid="show-transcriptions"]');
    if (await showTranscriptionsToggle.isVisible()) {
      await showTranscriptionsToggle.click();
    }

    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Record audio
    await recordButton.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    
    // Wait for processing
    await page.waitForSelector('text=Test transcription', { timeout: 10000 });
    
    // Should show transcriptions
    await expect(page.locator('text=Test transcription')).toBeVisible();
    await expect(page.locator('text=Test AI response')).toBeVisible();
  });

  test('should handle touch events for mobile', async ({ page }) => {
    // Simulate mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });
    
    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Simulate touch start
    await recordButton.dispatchEvent('touchstart');
    
    // Should show recording state
    await expect(page.locator('text=Vorbește acum')).toBeVisible();
    
    // Simulate touch end
    await recordButton.dispatchEvent('touchend');
    
    // Should show processing state
    await expect(page.locator('text=Se procesează')).toBeVisible();
  });

  test('should stop audio when stop button is clicked', async ({ page }) => {
    // Mock successful API response with audio
    await page.route('**/functions/v1/speech2speech-chat', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          transcription: 'Test',
          aiResponse: 'Response',
          audioContent: 'mockAudioData',
          metadata: { conversationId: 'test' }
        })
      });
    });

    const recordButton = page.locator('button:has-text("Ține apăsat pentru a vorbi")');
    
    // Record and process
    await recordButton.hover();
    await page.mouse.down();
    await page.waitForTimeout(1000);
    await page.mouse.up();
    
    // Wait for audio to start playing
    await page.waitForSelector('button:has-text("Oprește audio")', { timeout: 10000 });
    
    // Click stop audio
    await page.locator('button:has-text("Oprește audio")').click();
    
    // Stop button should disappear
    await expect(page.locator('button:has-text("Oprește audio")')).not.toBeVisible();
  });
});