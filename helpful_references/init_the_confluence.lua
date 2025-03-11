-- forces the map into singlenode mode, don't do this if this is just a "realm".
luamap.set_singlenode()

-- creates a terrain noise
luamap.register_noise("river",{
    type = "2d",
    np_vals = {
        offset = 0,
        scale = 1,
        spread = {x=300, y=300, z=300},
        seed = 5003345,
        octaves = 6,
        persist = 0.63,
        lacunarity = 2.0,
        flags = ""
    },
})


-- https://www.desmos.com/3d/66d1bf1cc5

local seafloor_depth = 20
local e = 2.718281828459045235360


local max_mount_height = 100
local mount_radius = 500
-- M(x,y)
local function get_mount_height(x,z,noise)
    return max_mount_height*e^(-(x^2+z^2)/(mount_radius^2)) - noise*10
end


-- d
local function get_river_depression_depth_scalar(x,z,noise)
    return 0.1*get_mount_height(x,z,noise)
end


-- R(x,y)
local river_width_mod = 17

local function get_river_depression_factor(x,z,river_wave_amplitude2d,river_wave_frequency2d)
    local xaxissine = (x-river_wave_amplitude2d*math.sin(river_wave_frequency2d*z))/river_width_mod
    local zaxissine = (z-river_wave_amplitude2d*math.cos(river_wave_frequency2d*x))/river_width_mod
    local xpart = e^(-(xaxissine)^2)
    local zpart = e^(-(zaxissine)^2)
    local center_correction = e^(-((xaxissine)^2+(zaxissine)^2))
    return (xpart+zpart-center_correction)
end

local function get_river_depression(x,z,river_wave_amplitude2d,river_wave_frequency2d,noise)
    return get_river_depression_depth_scalar(x,z,noise)*get_river_depression_factor(x,z,river_wave_amplitude2d,river_wave_frequency2d)
end



local baseAmplitude = 50
local baseFrequency = .015
local function get_height(x,z,rivernoise)
    return get_mount_height(x,z,rivernoise) - get_river_depression(x,z,baseAmplitude*rivernoise,baseFrequency*rivernoise,rivernoise) - seafloor_depth
end

local function get_height_without_river(x,z,rivernoise)
    return get_mount_height(x,z,rivernoise) - seafloor_depth
end

local function get_river_existence(x,z,rivernoise)
    return get_river_depression_factor(x,z,baseAmplitude*rivernoise,baseFrequency*rivernoise) > .9
end


local c_stone = minetest.get_content_id("default:stone")
local c_water = minetest.get_content_id("default:water_source")
local c_rwater = minetest.get_content_id("default:river_water_source")

local water_level = 0

local old_logic = luamap.logic

function luamap.logic(noise_vals,x,y,z,seed,original_content)

    -- get any terrain defined in another mod
    local content = old_logic(noise_vals,x,y,z,seed,original_content)


    local rivernoise = noise_vals.river

    -- if ((y < get_height_without_river(x,z,rivernoise) - 5) and get_river_existence(x,z,rivernoise)) then
    --     content = c_rwater
    -- end
    if y < 0 then
        content = c_water
    end
    local h = get_height(x,z,rivernoise)
    if y <= h then
        content = c_stone
        if get_river_existence(x,z,rivernoise) and y > h-2 then
            content = c_rwater
        end 
    end


    return content
end

local old_postcalc = luamap.precalc
function luamap.postcalc(data, area, vm, minp, maxp, seed)
    old_postcalc(data, area, vm, minp, maxp, seed)
    biomegen.generate_all(data, area, vm, minp, maxp, seed)
end