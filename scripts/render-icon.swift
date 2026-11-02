import AppKit
let url = URL(fileURLWithPath: CommandLine.arguments[1])
guard let image = NSImage(contentsOf: url) else { fatalError("Cannot load SVG") }
let size = Int(CommandLine.arguments[3])!
let bitmap = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 4, hasAlpha: true, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
NSGraphicsContext.saveGraphicsState()
NSGraphicsContext.current = NSGraphicsContext(bitmapImageRep: bitmap)
let scale = CommandLine.arguments.count > 4 ? Double(CommandLine.arguments[4])! : 1.0
NSColor(srgbRed: 16.0/255, green: 29.0/255, blue: 50.0/255, alpha: 1).setFill()
NSRect(x: 0, y: 0, width: size, height: size).fill()
let inset = Double(size) * (1 - scale) / 2
image.draw(in: NSRect(x: inset, y: inset, width: Double(size) * scale, height: Double(size) * scale))
NSGraphicsContext.restoreGraphicsState()
// Strip the alpha channel after rendering; AppKit draws into an RGBA context.
let opaque = NSBitmapImageRep(bitmapDataPlanes: nil, pixelsWide: size, pixelsHigh: size, bitsPerSample: 8, samplesPerPixel: 3, hasAlpha: false, isPlanar: false, colorSpaceName: .deviceRGB, bytesPerRow: 0, bitsPerPixel: 0)!
for y in 0..<size {
    for x in 0..<size {
        opaque.setColor(bitmap.colorAt(x: x, y: y)!, atX: x, y: y)
    }
}
try opaque.representation(using: .png, properties: [:])!.write(to: URL(fileURLWithPath: CommandLine.arguments[2]))
