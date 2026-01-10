# HyperStream Testing Guide

## Prerequisites
- Two terminal windows open
- Test data created in `test-data/` folder

## Test 1: Interactive Mode (Recommended First Test)

### Terminal 1 - SENDER:
```bash
npx tsx src/cli.tsx
```
1. Type: `/ezshare`
2. Press Enter
3. Use arrow keys to select "📤 Send file or folder"
4. Press Enter
5. Navigate with arrow keys to find `test-data` folder
6. Press Enter to enter the folder
7. Select `message.txt` with Enter
8. **COPY THE SHARE KEY** that appears (looks like: abc123XYZ...)

### Terminal 2 - RECEIVER:
```bash
npx tsx src/cli.tsx
```
1. Type: `/ezshare`
2. Press Enter
3. Select "📥 Receive file or folder"
4. Press Enter
5. Paste the share key from Terminal 1
6. Press Enter
7. Watch the transfer complete!

### Verify:
```bash
# Check the received file
cat message.txt
# Should show: "Hello from HyperStream!"
```

---

## Test 2: Direct CLI Mode

### Terminal 1 - SENDER:
```bash
npx tsx src/cli.tsx send ./test-data/message.txt
```
Copy the share key displayed

### Terminal 2 - RECEIVER:
```bash
npx tsx src/cli.tsx receive <PASTE-KEY-HERE> -o ./downloads
```

### Verify:
```bash
cat downloads/message.txt
```

---

## Test 3: Directory Transfer

### Terminal 1 - SENDER:
```bash
npx tsx src/cli.tsx send ./test-data
```

### Terminal 2 - RECEIVER:
```bash
npx tsx src/cli.tsx receive <KEY> -o ./received-dir
```

### Verify:
```bash
ls -R received-dir/
cat received-dir/test-data/message.txt
```

---

## Test 4: Large File (Progress Bar Test)

### Create large file:
```bash
dd if=/dev/urandom of=test-data/large.bin bs=1M count=10
```

### Send and watch progress bar:
```bash
npx tsx src/cli.tsx send ./test-data/large.bin
```

---

## Troubleshooting

**If connection hangs:**
- Check firewall settings
- Ensure both machines can access internet (for DHT bootstrap)
- Try on same network first

**If you see errors:**
- Check that zstd is installed: `zstd --version`
- Verify Node.js version: `node --version` (should be v22+)
- Run build: `npm run build`

**Exit the shell:**
- Type `/exit` or press `q` in command mode
- Press Ctrl+C to force quit
