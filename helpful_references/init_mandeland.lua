
-- forces the map into singlenode mode
luamap.set_singlenode()

-- localize vars
local lerp = luamap.lerp
local remap = luamap.remap
local coserp = luamap.coserp
local abs = math.abs
local lines = {}
local old_logic = luamap.logic
local old_postcalc = luamap.postcalc
local old_precalc = luamap.precalc


luamap.register_noise("terrain",{
    type = "2d",
    np_vals = {
        offset = 0,
        scale = 1,
        spread = {x=50, y=50, z=50},
        seed = 5900033,
        octaves = 3,
        persist = 0.63,
        lacunarity = 2.0,
        flags = ""
    },
})


local function mandel(x,z,steps)
    local a = 0
    local b = 0
    for i = 0,steps do
        local old_a = a
        a = (a^2 - b^2) + x
        b = 2*old_a*b + z 
        if a^2 + b^2 > 20 then return i end
    end
    return steps
end
-- mandelbrot parameters. Change these to get very different landscapes. Try
-- using a fractal explorer to find new offsets. Try zeroing in on an
-- interesting fractal feature at approximately the same scale. Increasing steps
-- makes the landscape deeper and more detailed, but costs calculation time.
-- Changing the offsets changes the location of the landscape on the mandelbrot
-- set. changing the scale will zoom in or out of the mandelbrot.

local scale = 10000000
local offsetx = -1415/2000
local offsetz = -706/2000
local steps = 150

-- content ids

local c_air
local c_stone 
local c_water 

function luamap.precalc(data, area, vm, minp, maxp, seed)
    old_precalc(data, area, vm, minp, maxp, seed)
    c_air = minetest.get_content_id("air")
    c_stone = minetest.get_content_id("mapgen_stone")
    c_water = minetest.get_content_id("mapgen_water_source")
end

--mapgen logic

function luamap.logic(noisevals,x,y,z,seed)


    local content = old_logic(noisevals,x,y,z,seed) -- returns air if no other luamap mapgens exist
    local mandelfactor = remap(mandel( (x/scale)+offsetx , (z/scale)+offsetz ,steps),0,steps,0,-1)*150
    local height = mandelfactor  + 145
    
    local terrain = noisevals.terrain*5 -- terrrian is a 2d noise varying between -2 and 2

    height = height + terrain

    if y < 0 then
        content = c_water
    end
    if y < height then
        content = c_stone 
    end
    return content
end



-- generate biomes with biomegen
function luamap.postcalc(data, area, vm, minp, maxp, seed)
    old_postcalc(data, area, vm, minp, maxp, seed)
    biomegen.generate_all(data, area, vm, minp, maxp, seed)
end
