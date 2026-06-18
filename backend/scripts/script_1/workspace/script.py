import matplotlib.pyplot as plt
import numpy as np

print(">>> Generating sine wave...")
x = np.linspace(0, 2 * np.pi, 100)
y = np.sin(x)

plt.figure(figsize=(8, 5))
plt.plot(x, y, color='#8b5cf6')
plt.title("Sine Wave - LiteFlow Demo")
plt.xlabel("X")
plt.ylabel("Y")
plt.tight_layout()
plt.savefig("chart_demo.png")
print(">>> Chart generated and saved to workspace as 'chart_demo.png'")
print(">>> Process Completed Successfully!")