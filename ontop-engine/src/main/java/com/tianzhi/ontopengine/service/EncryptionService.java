package com.tianzhi.ontopengine.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import javax.annotation.PostConstruct;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.ByteBuffer;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.SecureRandom;
import java.util.Base64;

/**
 * Fernet-compatible encryption using pure JDK crypto.
 * Reads the same key file as Python backend for zero-migration.
 */
@Service
public class EncryptionService {

    private static final Logger log = LoggerFactory.getLogger(EncryptionService.class);

    private byte[] signingKey;    // first 16 bytes of decoded key
    private byte[] encryptionKey; // last 16 bytes of decoded key

    @Value("${sqlite.encryption-key-path}")
    private String encryptionKeyPath;

    @PostConstruct
    public void init() throws Exception {
        String keyPathStr = encryptionKeyPath;
        Path keyPath = Path.of(keyPathStr);

        if (Files.exists(keyPath)) {
            String keyStr = Files.readString(keyPath).trim();
            byte[] keyBytes = Base64.getUrlDecoder().decode(keyStr);
            if (keyBytes.length != 32) {
                throw new IllegalArgumentException("Fernet key must be 32 bytes, got " + keyBytes.length);
            }
            this.signingKey = new byte[16];
            this.encryptionKey = new byte[16];
            System.arraycopy(keyBytes, 0, signingKey, 0, 16);
            System.arraycopy(keyBytes, 16, encryptionKey, 0, 16);
            log.info("Loaded Fernet encryption key from {}", keyPath);
        } else {
            Files.createDirectories(keyPath.getParent());
            byte[] newKey = new byte[32];
            new SecureRandom().nextBytes(newKey);
            this.signingKey = new byte[16];
            this.encryptionKey = new byte[16];
            System.arraycopy(newKey, 0, signingKey, 0, 16);
            System.arraycopy(newKey, 16, encryptionKey, 0, 16);
            Files.writeString(keyPath, Base64.getUrlEncoder().withoutPadding().encodeToString(newKey));
            log.info("Generated new Fernet encryption key at {}", keyPath);
        }
    }

    public String encrypt(String plaintext) {
        try {
            byte[] iv = new byte[16];
            new SecureRandom().nextBytes(iv);

            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.ENCRYPT_MODE,
                    new SecretKeySpec(encryptionKey, "AES"),
                    new IvParameterSpec(iv));
            byte[] ciphertext = cipher.doFinal(plaintext.getBytes("UTF-8"));

            long timestamp = System.currentTimeMillis() / 1000;

            // Build unsigned: version(1) + timestamp(8) + iv(16) + ciphertext(n)
            ByteBuffer unsigned = ByteBuffer.allocate(1 + 8 + 16 + ciphertext.length);
            unsigned.put((byte) 0x80);
            unsigned.putLong(timestamp);
            unsigned.put(iv);
            unsigned.put(ciphertext);

            // HMAC-SHA256
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            byte[] hmac = mac.doFinal(unsigned.array());

            // Concatenate unsigned + hmac
            byte[] token = new byte[unsigned.array().length + hmac.length];
            System.arraycopy(unsigned.array(), 0, token, 0, unsigned.array().length);
            System.arraycopy(hmac, 0, token, unsigned.array().length, hmac.length);

            return Base64.getUrlEncoder().withoutPadding().encodeToString(token);
        } catch (Exception e) {
            throw new RuntimeException("Encryption failed", e);
        }
    }

    public String decrypt(String tokenStr) {
        try {
            byte[] token = Base64.getUrlDecoder().decode(tokenStr);
            if (token.length < 57) throw new IllegalArgumentException("Token too short");

            // Verify HMAC (last 32 bytes)
            int hmacOffset = token.length - 32;
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(signingKey, "HmacSHA256"));
            byte[] computedHmac = mac.doFinal(java.util.Arrays.copyOfRange(token, 0, hmacOffset));

            byte[] receivedHmac = java.util.Arrays.copyOfRange(token, hmacOffset, token.length);
            if (!constantTimeEquals(computedHmac, receivedHmac)) {
                throw new IllegalArgumentException("HMAC verification failed");
            }

            // Extract IV (bytes 9..24)
            byte[] iv = java.util.Arrays.copyOfRange(token, 9, 25);
            // Extract ciphertext (bytes 25..hmacOffset)
            byte[] ciphertext = java.util.Arrays.copyOfRange(token, 25, hmacOffset);

            Cipher cipher = Cipher.getInstance("AES/CBC/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE,
                    new SecretKeySpec(encryptionKey, "AES"),
                    new IvParameterSpec(iv));
            byte[] plaintext = cipher.doFinal(ciphertext);

            return new String(plaintext, "UTF-8");
        } catch (Exception e) {
            throw new RuntimeException("Decryption failed: " + e.getMessage(), e);
        }
    }

    private static boolean constantTimeEquals(byte[] a, byte[] b) {
        if (a.length != b.length) return false;
        int result = 0;
        for (int i = 0; i < a.length; i++) result |= a[i] ^ b[i];
        return result == 0;
    }
}
