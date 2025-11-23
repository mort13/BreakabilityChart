import numpy as np
c_mass = 0.2
#Rock
mass= 10000
resistance_percentage = 20
rockparameters = np.array([mass,resistance_percentage])
#Laser 1
maxlaserpower = 4080
minlaserpower = 340
resistanceModifierFactor = 0.8
#Laser 2
maxlaserpower = 3080
minlaserpower = 240
resistanceModifierFactor = 0.9
#Laser 3
maxlaserpower = 2080
minlaserpower = 140
resistanceModifierFactor = 1.2
#laserParameters = [maxlaserpower, minlaserpower, resistanceModifierFactor]
laserParameters = [[4080,340,0.8],[3080,240,0.9],[2080,140,1.2]]

powerneeded = mass* c_mass* (1 + resistance_percentage / 100) 

def findPowerPercentages(laserParameters, rockparameters):
    effResistanceModifier = laserParameters[0][2]
    maxPower = laserParameters[0][0]
    i=0
    powerneeded = mass* c_mass* (1 + resistance_percentage / 100)*effResistanceModifier
    powerPercentage = powerneeded / maxPower
    while powerPercentage > 1:
        i +=1
        effResistanceModifier *= laserParameters[i][2]
        powerneeded = mass* c_mass* (1 + resistance_percentage / 100)*effResistanceModifier
        maxPower += laserParameters[i][0]
        powerPercentage = powerneeded / maxPower
    return powerPercentage

    
